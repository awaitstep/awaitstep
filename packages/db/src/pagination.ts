export interface PaginationParams {
  cursor?: string | null
  limit?: number
}

export interface PaginatedResult<T> {
  data: T[]
  nextCursor: string | null
}

export const DEFAULT_LIMIT = 50
export const MAX_LIMIT = 100

export function encodeCursor(id: string, timestamp: string): string {
  return `${id}_${timestamp}`
}

// `<id>_<ISO timestamp>`: the id is everything before the last `_` that starts the time.
const CURSOR = /^(.+)_(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z)$/

/**
 * Whether a cursor is one `encodeCursor` could have made: an id and a real
 * UTC instant. A list validates it before any query, so a malformed one is
 * the caller's error, never the database's (pg would fail the timestamp cast).
 */
export function isCursor(cursor: string): boolean {
  const match = cursor.match(CURSOR)
  if (!match) return false
  const at = Date.parse(match[2]!)
  // Date.parse rolls 31 Feb over into March; the database refuses it. Only an exact round trip is real.
  return !Number.isNaN(at) && new Date(at).toISOString().slice(0, 19) === match[2]!.slice(0, 19)
}

export function decodeCursor(cursor: string): { id: string; timestamp: string } {
  const match = cursor.match(CURSOR)
  if (!match || !isCursor(cursor)) throw new Error('Invalid cursor')
  return { id: match[1]!, timestamp: match[2]! }
}

export function clampLimit(limit?: number | null): number {
  if (limit == null) return DEFAULT_LIMIT
  return Math.min(Math.max(1, limit), MAX_LIMIT)
}

export function paginateResults<T extends { id: string }>(
  rows: T[],
  limit: number,
  getTimestamp: (row: T) => string,
): PaginatedResult<T> {
  const hasMore = rows.length > limit
  const data = hasMore ? rows.slice(0, limit) : rows
  const nextCursor =
    hasMore && data.length > 0
      ? encodeCursor(data[data.length - 1].id, getTimestamp(data[data.length - 1]))
      : null
  return { data, nextCursor }
}
