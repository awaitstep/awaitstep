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
  const rows = await insertWhereQuery(db, table, row, from, condition)
  return (rows[0] as T | undefined) ?? null
}

/** `insertWhere`'s statement, not yet run: for a batch that must write several statements atomically. */
export function insertWhereQuery(
  db: AnyTable,
  table: AnyTable,
  row: Record<string, unknown>,
  from: AnyTable,
  condition: SQL,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- drizzle's pending insert, run by `await` or a batch
): any {
  return db
    .insert(table)
    .select(db.select(boundFields(table, row)).from(from).where(condition))
    .returning()
}

/**
 * `row`'s values as the select list of an `INSERT … SELECT`, one bound
 * parameter per column of `table` so each reaches the driver the way a plain
 * insert would send it.
 */
export function boundFields(table: AnyTable, row: Record<string, unknown>): Record<string, SQL> {
  return Object.fromEntries(
    Object.entries(getTableColumns(table) as Record<string, Column>).map(([key, column]) => [
      key,
      // Null bypasses the encoder: some map it to a value (a boolean to 0).
      row[key] == null ? sql`null` : sql`${sql.param(row[key], column)}`,
    ]),
  )
}
