import { invalidError } from '../scenario'

const DEFAULT_LIMIT = 25
const MAX_LIMIT = 100

/** Cursors are offsets into the filtered list, opaque to callers. */
function offsetOf(cursor: string | undefined): number {
  if (cursor === undefined) return 0
  const offset = Number(cursor)
  if (!Number.isInteger(offset) || offset < 0) throw invalidError('That page no longer exists')
  return offset
}

/** One page of `list` from `cursor`, and the cursor of the next page when there is one. */
export function pageOf<T>(
  list: T[],
  { cursor, limit }: { cursor?: string; limit?: number },
): { page: T[]; nextCursor: string | null } {
  const size = Math.min(Math.max(limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT)
  const offset = offsetOf(cursor)
  return {
    page: list.slice(offset, offset + size),
    nextCursor: offset + size < list.length ? String(offset + size) : null,
  }
}
