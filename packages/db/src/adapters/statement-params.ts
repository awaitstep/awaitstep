import { getTableColumns } from 'drizzle-orm'

/** D1 binds at most this many parameters per statement; every multi-row write keeps under it. */
export const D1_MAX_PARAMS = 100

/** `items` in runs of at most `size`, in order. */
export function chunked<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/** How many rows of `columns` bound values fit in one statement. */
export function rowsPerStatement(columns: number): number {
  return Math.max(1, Math.floor(D1_MAX_PARAMS / columns))
}

/**
 * How many rows of `table` fit in one insert: drizzle binds at most one
 * value per column per row, whichever columns a row names, so the table's
 * width is the bound — a column added later can't push a chunk over.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function rowsPerInsert(table: any): number {
  return rowsPerStatement(Object.keys(getTableColumns(table)).length)
}
