export type SqlQueryFn = (text: string, params?: unknown[]) => Promise<unknown>;

/**
 * Multi-row INSERT in chunks so we stay under Postgres parameter limits
 * without changing row values or conflict behavior.
 */
export async function executeBatchInsert(
  queryFn: SqlQueryFn,
  insertPrefix: string,
  rows: unknown[][],
  options?: {
    suffix?: string;
    casts?: Record<number, string>;
    chunkSize?: number;
  },
): Promise<void> {
  if (rows.length === 0) return;

  const colCount = rows[0].length;
  const chunkSize = options?.chunkSize ?? 80;
  const casts = options?.casts ?? {};
  const suffix = options?.suffix ? ` ${options.suffix}` : '';

  for (let offset = 0; offset < rows.length; offset += chunkSize) {
    const chunk = rows.slice(offset, offset + chunkSize);
    const params: unknown[] = [];
    const valuesSql = chunk.map((row, rowIndex) => {
      if (row.length !== colCount) {
        throw new Error('executeBatchInsert: inconsistent row length');
      }
      const start = rowIndex * colCount;
      params.push(...row);
      const placeholders = row.map((_, colIndex) => {
        const n = start + colIndex + 1;
        return `$${n}${casts[colIndex + 1] ?? ''}`;
      });
      return `(${placeholders.join(',')})`;
    });
    await queryFn(`${insertPrefix} ${valuesSql.join(',')}${suffix}`, params);
  }
}
