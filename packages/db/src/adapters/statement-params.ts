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
