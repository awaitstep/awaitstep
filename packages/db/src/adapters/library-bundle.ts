import { sql, type SQL } from 'drizzle-orm'
import type {
  LibraryBundle,
  LibraryBundleItem,
  LibraryBundleLimits,
  LibraryBundleRoots,
} from '../library-types.js'
import { idList, readJsonArray, type Dialect } from './json-array.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = any

/**
 * What a deploy bundles from the Library, in one statement: a recursive CTE
 * walks from what the workflow imports and places, through each item's
 * latest published imports, to every item that ends up in the bundle.
 *
 * Each importer resolves `#modules/<slug>` from where it sits — the
 * workflow and its workspace's items from their workspace, then the
 * project; a project item from the project only — and only within the
 * workflow's project, so an item of another workspace is never reached.
 * Rows are (item, importer) pairs and the CTE takes their union, so a cycle
 * between modules ends once every pair is known.
 *
 * Raw SQL: the query builder has no recursive CTE. Every value is bound.
 */
export class LibraryBundleAdapter {
  constructor(
    private db: AnyDb,
    private dialect: Dialect,
  ) {}

  async resolve(roots: LibraryBundleRoots, limits: LibraryBundleLimits): Promise<LibraryBundle> {
    const cap = limits.items
    const pg = this.dialect === 'pg'
    const owner = roots.workspaceId ?? ''

    // Module `t` is what an importer whose owner key is `key` gets for
    // `t.slug`: its own workspace's module, else the project's own (the
    // same rule as LibraryFields.resolves, over plain aliases).
    const resolves = (t: string, key: SQL) =>
      sql`${sql.raw(t)}.project_id = ${roots.projectId} and ${sql.raw(t)}.kind = 'module' and (coalesce(${sql.raw(t)}.workspace_id, '') = ${key} or (${sql.raw(t)}.workspace_id is null and not exists (select 1 from library_items lbo where lbo.project_id = ${sql.raw(t)}.project_id and lbo.kind = 'module' and lbo.slug = ${sql.raw(t)}.slug and coalesce(lbo.workspace_id, '') = ${key})))`

    const latest = sql`select v.item_id, v.version, v.files, v.imports from library_versions v inner join library_items vi on vi.id = v.item_id where vi.project_id = ${roots.projectId} and v.seq = (select max(v2.seq) from library_versions v2 where v2.item_id = v.item_id)`

    const importsOf = pg
      ? sql.raw('jsonb_array_elements_text(l.imports::jsonb) as j(value)')
      : sql.raw('json_each(l.imports) as j')
    const reach = sql`select t.id, cast(null as text) from library_items t where t.slug in ${idList(this.dialect, roots.slugs)} and ${resolves('t', sql`${owner}`)}
      union
      select n.id, cast(null as text) from library_items n where n.id in ${idList(this.dialect, roots.nodeItemIds)} and n.kind = 'node' and n.project_id = ${roots.projectId} and coalesce(n.workspace_id, '') in (${owner}, '')
      union
      select m.id, r.item_id from lbr r inner join library_items ri on ri.id = r.item_id inner join lbl l on l.item_id = ri.id inner join ${importsOf} on true inner join library_items m on m.slug = j.value and m.id <> ri.id and ${resolves('m', sql.raw("coalesce(ri.workspace_id, '')"))}`

    const fn = sql.raw(pg ? 'json_build_object' : 'json_object')
    const stored = (column: string) =>
      pg
        ? sql.raw(`coalesce(${column}::json, '[]'::json)`)
        : sql.raw(`json(coalesce(${column}, '[]'))`)
    const importers = pg
      ? sql`(select coalesce(json_agg(r2.importer_id order by r2.importer_id), '[]'::json) from lbr r2 where r2.item_id = i.id)`
      : sql`(select json_group_array(r2.importer_id order by r2.importer_id) from lbr r2 where r2.item_id = i.id)`
    // The bundle's size is judged before any file body is sent: over a
    // limit, every item comes back without its files.
    const fileCount = pg
      ? sql.raw('coalesce(sum(json_array_length(ls.files::json)), 0)')
      : sql.raw('coalesce(sum(json_array_length(ls.files)), 0)')
    const totals = sql`select coalesce(sum(length(ls.files)), 0) as bytes, ${fileCount} as files from lbp inner join lbl ls on ls.item_id = lbp.item_id`
    const oversize = sql`exists (select 1 from (${totals}) t where t.bytes > ${limits.bytes} or t.files > ${limits.files})`
    const files = pg
      ? sql`case when ${oversize} then '[]'::json else ${stored('l.files')} end`
      : sql`case when ${oversize} then json('[]') else ${stored('l.files')} end`
    const item = sql`${fn}('id', i.id, 'kind', i.kind, 'slug', i.slug, 'name', i.name, 'workspaceId', i.workspace_id, 'version', l.version, 'files', ${files}, 'imports', ${stored('l.imports')}, 'importers', ${importers})`
    const order = sql.raw('i.kind, i.slug, i.id')
    const items = pg
      ? sql`coalesce(json_agg(${item} order by ${order}), '[]'::json)`
      : sql`json_group_array(json(${item}) order by ${order})`

    // One more than the cap, so the caller can tell the closure ran over.
    const picked = sql`select distinct item_id from lbr order by item_id limit ${cap + 1}`
    const result = sql`${fn}('items', ${items}, 'oversize', ${pg ? oversize : sql`json(case when ${oversize} then 'true' else 'false' end)`})`
    const statement = sql`(with recursive lbl(item_id, version, files, imports) as (${latest}), lbr(item_id, importer_id) as (${reach}), lbp(item_id) as (${picked}) select ${result} from lbp d inner join library_items i on i.id = d.item_id left join lbl l on l.item_id = i.id)`

    const rows = await this.db.select({ bundle: statement }).from(sql`(select 1) as one`)
    const raw = rows[0]?.bundle
    const bundle = (typeof raw === 'string' ? JSON.parse(raw) : raw) as {
      items: unknown
      oversize: boolean
    } | null
    const all = readJsonArray<LibraryBundleItem>(bundle?.items).map((entry) => ({
      ...entry,
      files: readJsonArray<LibraryBundleItem['files'][number]>(entry.files),
      imports: readJsonArray<string>(entry.imports),
      importers: readJsonArray<string | null>(entry.importers),
    }))
    return {
      items: all.slice(0, cap),
      truncated: all.length > cap,
      oversize: bundle?.oversize === true,
    }
  }
}
