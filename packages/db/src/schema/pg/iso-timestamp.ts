import { customType } from 'drizzle-orm/pg-core'

/**
 * Reads a `timestamp` (without time zone) value as an ISO 8601 UTC string.
 *
 * Postgres returns such a column as `2099-01-01 00:00:00`: no `T`, no zone.
 * JavaScript parses that as local time, so on a host not set to UTC every
 * expiry comparison would be off by the host's offset. Values are written as
 * UTC ISO strings, so the stored wall clock is UTC and gets a `Z` back.
 */
export function toIsoTimestamp(value: string | Date): string {
  if (value instanceof Date) return value.toISOString()
  const parsed = new Date(`${value.replace(' ', 'T')}Z`)
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString()
}

/**
 * A `timestamp` column read back as an ISO 8601 UTC string, so pg rows match
 * what the sqlite schema returns. Use in place of `timestamp(..., { mode: 'string' })`.
 *
 * Writes are pinned to UTC too: better-auth hands its columns `Date`s, which
 * node-postgres would send as local time, and the column would keep that
 * local wall clock while reads assume UTC.
 */
export const isoTimestamp = customType<{ data: string; driverData: string | Date }>({
  dataType: () => 'timestamp',
  fromDriver: toIsoTimestamp,
  toDriver: (value: string | Date) => (value instanceof Date ? value.toISOString() : value),
})
