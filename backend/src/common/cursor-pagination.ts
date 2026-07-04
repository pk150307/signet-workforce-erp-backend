import { query as defaultQuery } from 'express-validator';
import { ValidationError } from './errors';

export type CursorDirection = 'next' | 'prev';

export interface CursorPaginationQuery {
  pageSize: number;
  cursor?: string | null;
  direction: CursorDirection;
}

export interface CursorPaginationMeta {
  pageSize: number;
  nextCursor: string | null;
  prevCursor: string | null;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface CursorPaginatedResult<T> {
  data: T[];
  /** Alias for clients still reading `items`. */
  items: T[];
  pagination: CursorPaginationMeta;
}

export interface CursorSortField {
  /** SQL expression used in ORDER BY / WHERE, e.g. `e.created_at` */
  column: string;
  /** Key stored in the cursor payload, e.g. `createdAt` */
  key: string;
  /** Default sort direction for the "next" page. */
  direction?: 'ASC' | 'DESC';
}

export const DEFAULT_PAGE_SIZE = 10;
export const MAX_PAGE_SIZE = 100;

const DEFAULT_SORT: CursorSortField[] = [
  { column: 'created_at', key: 'createdAt', direction: 'DESC' },
  { column: 'id', key: 'id', direction: 'DESC' },
];

export function parseCursorPaginationQuery(query: {
  pageSize?: unknown;
  cursor?: unknown;
  direction?: unknown;
  page?: unknown;
}): CursorPaginationQuery {
  const rawSize = Number(query.pageSize ?? DEFAULT_PAGE_SIZE);
  const pageSize = Number.isFinite(rawSize)
    ? Math.min(Math.max(Math.trunc(rawSize), 1), MAX_PAGE_SIZE)
    : DEFAULT_PAGE_SIZE;

  const direction = String(query.direction ?? 'next').toLowerCase() === 'prev' ? 'prev' : 'next';
  const cursor = query.cursor != null && String(query.cursor).trim() !== ''
    ? String(query.cursor).trim()
    : null;

  return { pageSize, cursor, direction };
}

/**
 * Bridge for repositories still on offset pagination.
 * Accepts cursor tokens produced by `createPaginatedResult` (`__offset_<page>`).
 */
export function legacyOffsetFromCursor(pagination: CursorPaginationQuery): {
  page: number;
  pageSize: number;
} {
  if (!pagination.cursor) {
    return { page: 1, pageSize: pagination.pageSize };
  }

  if (pagination.cursor.startsWith('__offset_')) {
    const page = Number(pagination.cursor.slice('__offset_'.length));
    return {
      page: Number.isFinite(page) && page > 0 ? Math.trunc(page) : 1,
      pageSize: pagination.pageSize,
    };
  }

  // Opaque keyset cursor against an offset-only repository.
  throw new ValidationError({ cursor: ['Invalid or expired cursor'] });
}

/** Express-validator chain for cursor list endpoints. */
export const cursorPaginationValidators = [
  defaultQuery('pageSize').optional().isInt({ min: 1, max: MAX_PAGE_SIZE }).toInt(),
  defaultQuery('cursor').optional().isString().trim(),
  defaultQuery('direction').optional().isIn(['next', 'prev']),
];

export function encodeCursor(payload: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string): Record<string, unknown> {
  try {
    const json = Buffer.from(cursor, 'base64url').toString('utf8');
    const parsed = JSON.parse(json) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Invalid cursor payload');
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new ValidationError({ cursor: ['Invalid or expired cursor'] });
  }
}

export function createCursorPaginatedResult<T>(
  items: T[],
  pageSize: number,
  options: {
    hasNext: boolean;
    hasPrev: boolean;
    nextCursor: string | null;
    prevCursor: string | null;
  },
): CursorPaginatedResult<T> {
  return {
    data: items,
    items,
    pagination: {
      pageSize,
      nextCursor: options.hasNext ? options.nextCursor : null,
      prevCursor: options.hasPrev ? options.prevCursor : null,
      hasNext: options.hasNext,
      hasPrev: options.hasPrev,
    },
  };
}

/**
 * Build ORDER BY + optional keyset WHERE for cursor pagination.
 * Uses (sort fields) tuple comparison. Default sort: created_at DESC, id DESC.
 */
export function buildCursorSql(
  paramStartIndex: number,
  pagination: CursorPaginationQuery,
  sortFields: CursorSortField[] = DEFAULT_SORT,
): {
  whereClause: string;
  orderBy: string;
  params: unknown[];
  limit: number;
  isReversed: boolean;
} {
  const fields = sortFields.length ? sortFields : DEFAULT_SORT;
  const goingPrev = pagination.direction === 'prev';
  const isReversed = goingPrev;

  const orderBy = fields
    .map((field) => {
      const baseDir = (field.direction ?? 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
      const dir = isReversed ? (baseDir === 'ASC' ? 'DESC' : 'ASC') : baseDir;
      return `${field.column} ${dir}`;
    })
    .join(', ');

  if (!pagination.cursor) {
    return {
      whereClause: '',
      orderBy,
      params: [],
      limit: pagination.pageSize + 1,
      isReversed,
    };
  }

  const payload = decodeCursor(pagination.cursor);
  const params: unknown[] = [];
  const comparisons: string[] = [];

  fields.forEach((field, index) => {
    const value = payload[field.key];
    if (value === undefined || value === null || value === '') {
      throw new ValidationError({ cursor: ['Invalid or expired cursor'] });
    }
    params.push(value);
    const paramRef = `$${paramStartIndex + index}`;
    const baseDir = (field.direction ?? 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    // For next page follow sort direction; for prev page invert comparison.
    const operator = goingPrev
      ? (baseDir === 'ASC' ? '<' : '>')
      : (baseDir === 'ASC' ? '>' : '<');

    if (index === 0) {
      comparisons.push(`${field.column} ${operator} ${paramRef}`);
    } else {
      const prefixes = fields.slice(0, index).map((f, i) => `${f.column} = $${paramStartIndex + i}`);
      comparisons.push(`(${prefixes.join(' AND ')} AND ${field.column} ${operator} ${paramRef})`);
    }
  });

  return {
    whereClause: `(${comparisons.join(' OR ')})`,
    orderBy,
    params,
    limit: pagination.pageSize + 1,
    isReversed,
  };
}

export function buildCursorFromRow(
  row: Record<string, unknown>,
  sortFields: CursorSortField[] = DEFAULT_SORT,
): string {
  const payload: Record<string, unknown> = {};
  for (const field of sortFields) {
    const snake = field.key.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
    const value = row[field.key] ?? row[snake] ?? row[field.column.split('.').pop() as string];
    if (value instanceof Date) {
      payload[field.key] = value.toISOString();
    } else {
      payload[field.key] = value;
    }
  }
  return encodeCursor(payload);
}

/**
 * Finalize rows from a pageSize+1 query into a cursor page.
 * `getCursorRow` must return the raw DB fields used for encoding cursors.
 */
export function finalizeCursorPage<TRow extends Record<string, unknown>, TItem>(
  rows: TRow[],
  pagination: CursorPaginationQuery,
  mapItem: (row: TRow) => TItem,
  sortFields: CursorSortField[] = DEFAULT_SORT,
  options?: { getCursorRow?: (row: TRow) => Record<string, unknown> },
): CursorPaginatedResult<TItem> {
  const isReversed = pagination.direction === 'prev';
  let pageRows = [...rows];
  const hasExtra = pageRows.length > pagination.pageSize;

  if (hasExtra) {
    pageRows = pageRows.slice(0, pagination.pageSize);
  }

  if (isReversed) {
    pageRows.reverse();
  }

  // - First page (no cursor): hasPrev=false, hasNext=hasExtra
  // - direction=next with cursor: hasPrev=true, hasNext=hasExtra
  // - direction=prev with cursor: hasNext=true, hasPrev=hasExtra
  const resolvedHasNext = !pagination.cursor
    ? hasExtra
    : pagination.direction === 'prev'
      ? true
      : hasExtra;

  const resolvedHasPrev = !pagination.cursor
    ? false
    : pagination.direction === 'next'
      ? true
      : hasExtra;

  const getCursorRow = options?.getCursorRow ?? ((row: TRow) => row as Record<string, unknown>);
  const first = pageRows[0];
  const last = pageRows[pageRows.length - 1];

  const items = pageRows.map(mapItem);

  return createCursorPaginatedResult(items, pagination.pageSize, {
    hasNext: resolvedHasNext && items.length > 0,
    hasPrev: resolvedHasPrev && items.length > 0,
    nextCursor: last ? buildCursorFromRow(getCursorRow(last), sortFields) : null,
    prevCursor: first ? buildCursorFromRow(getCursorRow(first), sortFields) : null,
  });
}

/** Default created_at/id sort fields with a table/alias prefix. */
export function defaultSortFields(alias = ''): CursorSortField[] {
  const prefix = alias ? `${alias}.` : '';
  return [
    { column: `${prefix}created_at`, key: 'createdAt', direction: 'DESC' },
    { column: `${prefix}id`, key: 'id', direction: 'DESC' },
  ];
}

type QueryFn = <T extends Record<string, unknown>>(
  text: string,
  params?: unknown[],
) => Promise<{ rows: T[] }>;

/**
 * Shared list executor for cursor-paginated repositories.
 * `selectSql` must be a full SELECT ... FROM ... [JOIN ...] without WHERE/ORDER/LIMIT.
 * Include `created_at` (and `id`) in the select list for cursor encoding.
 */
export async function runCursorList<TItem>(options: {
  queryFn: QueryFn;
  pagination: CursorPaginationQuery;
  alias?: string;
  conditions?: string[];
  params?: unknown[];
  selectSql: string;
  mapRow: (row: Record<string, unknown>) => TItem;
  sortFields?: CursorSortField[];
}): Promise<CursorPaginatedResult<TItem>> {
  const conditions = [...(options.conditions ?? [])];
  const params = [...(options.params ?? [])];
  const sortFields = options.sortFields ?? defaultSortFields(options.alias ?? '');
  const cursorSql = buildCursorSql(params.length + 1, options.pagination, sortFields);

  if (cursorSql.whereClause) {
    conditions.push(cursorSql.whereClause);
    params.push(...cursorSql.params);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const limitIndex = params.length + 1;
  const { rows } = await options.queryFn<Record<string, unknown>>(
    `${options.selectSql}
     ${where}
     ORDER BY ${cursorSql.orderBy}
     LIMIT $${limitIndex}`,
    [...params, cursorSql.limit],
  );

  return finalizeCursorPage(rows, options.pagination, options.mapRow, sortFields);
}
