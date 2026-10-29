import { getTableName, sql, type SQL } from 'drizzle-orm'

export type Dialect = 'sqlite' | 'pg'

/**
 * A JSON array of objects aggregated over the rows of a subquery — the way to
 * carry a list (a project's workspaces, an org's members) on the row that
 * owns it, so a listing stays one statement. The two dialects spell the
 * functions differently and disagree on the empty case (pg aggregates to
 * NULL), which `readJsonArray` evens out on the way back.
 *
 * `fields` maps each key of the objects to the column or expression for it.
 */
export function jsonArrayOf(
  dialect: Dialect,
  fields: Record<string, SQL | unknown>,
  orderBy?: SQL,
): SQL {
  const pairs = Object.entries(fields).flatMap(([key, value]) => [
    sql.raw(`'${key}'`),
    value as SQL,
  ])
  const object = sql.join(pairs, sql`, `)
  return jsonArrayOfValues(
    dialect,
    dialect === 'pg' ? sql`json_build_object(${object})` : sql`json_object(${object})`,
    orderBy,
  )
}

/**
 * A list of ids as one bound JSON parameter unpacked in SQL — `x in
 * ${idList(dialect, ids)}` — so a long list never meets D1's cap of 100
 * parameters per statement. An empty list matches nothing.
 */
export function idList(dialect: Dialect, ids: string[]): SQL {
  const json = JSON.stringify(ids)
  return dialect === 'pg'
    ? sql`(select json_array_elements_text(${json}::json))`
    : sql`(select value from json_each(${json}))`
}

/** As `jsonArrayOf`, for a list of scalars: the last run statuses of a workflow. */
export function jsonArrayOfValues(dialect: Dialect, value: SQL, orderBy?: SQL): SQL {
  const ordered = orderBy ? sql`${value} order by ${orderBy}` : value
  return dialect === 'pg'
    ? sql`coalesce(json_agg(${ordered}), '[]'::json)`
    : sql`json_group_array(${ordered})`
}

/**
 * A JSON aggregate nested inside another: sqlite's `json_object` would embed
 * the inner text as a string unless it is marked as JSON; pg's `json_agg`
 * already yields json.
 */
export function nestedJson(dialect: Dialect, value: SQL): SQL {
  return dialect === 'pg' ? value : sql`json(${value})`
}

/** The aggregate as the driver returns it: text on sqlite, parsed JSON on pg. */
export function readJsonArray<T>(value: unknown): T[] {
  if (value == null) return []
  if (typeof value === 'string') return JSON.parse(value) as T[]
  return value as T[]
}

/**
 * An aliased table as a FROM or JOIN operand inside a `sql` template:
 * `"projects" "cp"`. Embedding the alias itself renders only `"cp"`, which
 * names no table.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function aliasedFrom(table: any): SQL {
  // The original name is on the table under drizzle's own symbol; the alias is
  // what getTableName reports for an aliased table.
  const original = (table as Record<symbol, string>)[ORIGINAL_NAME]!
  return sql`${sql.identifier(original)} ${sql.identifier(getTableName(table))}`
}

const ORIGINAL_NAME = Symbol.for('drizzle:OriginalName')
