import { getTableColumns, sql, type Column, type SQL } from 'drizzle-orm'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTable = any

/**
 * Writes `row` only if `condition` matches a row of `from` — one
 * `INSERT … SELECT … WHERE … RETURNING`, so the check and the write cannot be
 * split by a concurrent change, and cost one round trip. `condition` must
 * match at most one row (a primary-key lookup), or the row is written once
 * per match. Null when nothing matched.
 *
 * Every column is bound with its own encoder, so booleans and dates reach
 * each driver the way a plain insert would send them.
 */
export async function insertWhere<T>(
  db: AnyTable,
  table: AnyTable,
  row: Record<string, unknown>,
  from: AnyTable,
  condition: SQL,
): Promise<T | null> {
  const fields = Object.fromEntries(
    Object.entries(getTableColumns(table) as Record<string, Column>).map(([key, column]) => [
      key,
      // Null bypasses the encoder: some map it to a value (a boolean to 0).
      row[key] == null ? sql`null` : sql`${sql.param(row[key], column)}`,
    ]),
  )
  const rows = await db
    .insert(table)
    .select(db.select(fields).from(from).where(condition))
    .returning()
  return (rows[0] as T | undefined) ?? null
}
