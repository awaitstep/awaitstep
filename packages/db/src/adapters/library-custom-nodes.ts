import { sql, type SQL } from 'drizzle-orm'
import type {
  WorkflowCustomNode,
  WorkflowCustomNodeReach,
  WorkflowCustomNodeTemplate,
} from '../library-types.js'
import { idList, readJsonArray, type Dialect } from './json-array.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = any

/**
 * The published custom nodes a workflow can place: node items of its
 * project owned by its workspace or by the project, each at its latest
 * published version. The reach is read from the workflow row inside the
 * statement, so an id or a workspace never comes from the caller.
 *
 * Raw SQL: a file is picked out of a version's stored JSON array by path,
 * which the query builder cannot spell. Every value is bound.
 */
export class LibraryCustomNodesAdapter {
  constructor(
    private db: AnyDb,
    private dialect: Dialect,
  ) {}

  async forWorkflow(
    workflowId: string,
    reach: WorkflowCustomNodeReach,
  ): Promise<WorkflowCustomNode[]> {
    const fn = this.fn()
    const item = sql`${fn}('itemId', n.id, 'owner', case when n.workspace_id is null then 'project' else 'workspace' end, 'version', v.version, 'manifest', ${this.file('node.json')}, 'icon', ${this.file('icon.svg')})`
    return this.list<WorkflowCustomNode>(workflowId, item, reach)
  }

  /** Only the nodes named: the preview asks for the ones the graph places. */
  async templatesForWorkflow(
    workflowId: string,
    itemIds: string[],
    reach: WorkflowCustomNodeReach,
  ): Promise<WorkflowCustomNodeTemplate[]> {
    if (itemIds.length === 0) return []
    // The manifest rides along so the caller drops what the listing drops.
    const item = sql`${this.fn()}('itemId', n.id, 'version', v.version, 'manifest', ${this.file('node.json')}, 'template', ${this.file('template.ts')})`
    return this.list<WorkflowCustomNodeTemplate>(
      workflowId,
      item,
      reach,
      sql` and n.id in ${idList(this.dialect, [...new Set(itemIds)])}`,
    )
  }

  private fn(): SQL {
    return sql.raw(this.dialect === 'pg' ? 'json_build_object' : 'json_object')
  }

  /** The source of the file at `path` in the version's stored files, or null. */
  private file(path: string): SQL {
    return this.dialect === 'pg'
      ? sql`(select f->>'source' from json_array_elements(v.files::json) as f where f->>'path' = ${path} limit 1)`
      : sql`(select json_extract(f.value, '$.source') from json_each(v.files) as f where json_extract(f.value, '$.path') = ${path} limit 1)`
  }

  private async list<T>(
    workflowId: string,
    item: SQL,
    reach: WorkflowCustomNodeReach,
    only: SQL = sql``,
  ): Promise<T[]> {
    // A workspace key reaches its workspaces' own items only (L1): the
    // project's nodes stay out, as on every other Library route.
    const owners =
      reach === 'workspace-only'
        ? sql`n.workspace_id = w.workspace_id`
        : sql`coalesce(n.workspace_id, '') in (coalesce(w.workspace_id, ''), '')`
    const order = sql.raw('n.name, n.id')
    const items =
      this.dialect === 'pg'
        ? sql`coalesce(json_agg(${item} order by ${order}), '[]'::json)`
        : sql`json_group_array(json(${item}) order by ${order})`
    const statement = sql`(select ${items} from workflows w inner join library_items n on n.project_id = w.project_id and n.kind = 'node' and ${owners} inner join library_versions v on v.item_id = n.id and v.seq = (select max(v2.seq) from library_versions v2 where v2.item_id = n.id) where w.id = ${workflowId}${only})`
    const rows = await this.db.select({ items: statement }).from(sql`(select 1) as one`)
    return readJsonArray<T>(rows[0]?.items)
  }
}
