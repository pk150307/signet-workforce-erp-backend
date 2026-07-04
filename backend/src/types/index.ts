export type {
  CursorDirection,
  CursorPaginatedResult,
  CursorPaginationMeta,
  CursorPaginationQuery,
  CursorSortField,
} from '../common/cursor-pagination';

export {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  buildCursorFromRow,
  buildCursorSql,
  createCursorPaginatedResult,
  cursorPaginationValidators,
  decodeCursor,
  defaultSortFields,
  encodeCursor,
  finalizeCursorPage,
  parseCursorPaginationQuery,
  legacyOffsetFromCursor,
  runCursorList,
} from '../common/cursor-pagination';

/**
 * @deprecated Prefer CursorPaginatedResult.
 * Kept so transitional call sites compile while migrating.
 */
export interface PaginatedResult<T> {
  items: T[];
  data?: T[];
  page?: number;
  pageSize: number;
  totalCount?: number;
  totalPages?: number;
  hasPreviousPage?: boolean;
  hasNextPage?: boolean;
  pagination?: {
    pageSize: number;
    nextCursor: string | null;
    prevCursor: string | null;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

/**
 * @deprecated Prefer createCursorPaginatedResult / finalizeCursorPage.
 * Converts legacy offset pages into the cursor response contract (without real cursors).
 */
export function createPaginatedResult<T>(
  items: T[],
  totalCount: number,
  page: number,
  pageSize: number,
): PaginatedResult<T> {
  const totalPages = Math.ceil(totalCount / pageSize) || 0;
  const hasPreviousPage = page > 1;
  const hasNextPage = page < totalPages;
  return {
    items,
    data: items,
    page,
    pageSize,
    totalCount,
    totalPages,
    hasPreviousPage,
    hasNextPage,
    pagination: {
      pageSize,
      nextCursor: hasNextPage ? `__offset_${page + 1}` : null,
      prevCursor: hasPreviousPage ? `__offset_${page - 1}` : null,
      hasNext: hasNextPage,
      hasPrev: hasPreviousPage,
    },
  };
}

export interface AuthenticatedUser {
  userId: string;
  sessionId: string;
  username: string;
  email: string;
  fullName: string;
  roles: string[];
  permissions: string[];
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      traceId?: string;
    }
  }
}

export {};
