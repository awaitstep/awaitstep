/**
 * Whether a write failed on a unique index. better-sqlite3 reports
 * `SQLITE_CONSTRAINT_UNIQUE`, Postgres `23505`, and D1 only SQLite's message
 * ("UNIQUE constraint failed: …"); drizzle may wrap the driver's error in its
 * own ("Failed query: …") with the original as `cause`, so the chain is
 * walked. A route answers any of them with 409.
 */
export function isUniqueViolation(error: unknown): boolean {
  for (let current = error, depth = 0; current && depth < 5; depth++) {
    if (typeof current !== 'object') return false
    const { code, cause, message } = current as {
      code?: unknown
      cause?: unknown
      message?: unknown
    }
    if (code === 'SQLITE_CONSTRAINT_UNIQUE' || code === '23505') return true
    if (typeof message === 'string' && message.includes('UNIQUE constraint failed')) return true
    current = cause
  }
  return false
}
