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

export function decodeCursor(cursor: string): { id: string; timestamp: string } {
  // Split on the last `_` before the ISO timestamp (starts with YYYY-)
  const match = cursor.match(/^(.+)_(\d{4}-.+)$/)
  if (!match) throw new Error('Invalid cursor')
  return { id: match[1], timestamp: match[2] }
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
