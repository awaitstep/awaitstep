import { eq, and, desc, or, lt, sql, aliasedTable } from 'drizzle-orm'
import type { InstalledNode, NodeUsage } from '../types.js'
import type { PaginationParams, PaginatedResult } from '../pagination.js'
import { clampLimit, decodeCursor, paginateResults } from '../pagination.js'
import { aliasedFrom, fieldOf, type Dialect } from './json-array.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTable = any

/** Where a node's use is counted: the organization's workflows and their current versions. */
export interface NodeUsageTables {
  workflows: AnyTable
  workflowVersions: AnyTable
  projects: AnyTable
}

export class InstalledNodesAdapter {
  constructor(
    private db: AnyTable,
    private table: AnyTable,
    private usageTables?: NodeUsageTables,
    private dialect: Dialect = 'sqlite',
  ) {}

  /**
   * Each installed node, its version, and how many of the organization's workflows use it
   * in their current version — one statement. Drafts saved after the current
   * version don't count.
   */
  async usage(organizationId: string): Promise<NodeUsage[]> {
    if (!this.usageTables) throw new Error('Node usage needs the workflow tables')
    const i = this.table
    const w = aliasedTable(this.usageTables.workflows, 'nuw')
    const v = aliasedTable(this.usageTables.workflowVersions, 'nuv')
    const p = aliasedTable(this.usageTables.projects, 'nup')
    const usesNode =
      this.dialect === 'pg'
        ? sql`exists (select 1 from jsonb_array_elements(${v.ir}::jsonb -> 'nodes') as un where un ->> 'type' = ${i.nodeId})`
        : sql`exists (select 1 from json_each(${v.ir}, '$.nodes') as un where json_extract(un.value, '$.type') = ${i.nodeId})`
    const rows = await this.db
      .select({
        nodeId: i.nodeId,
        version: i.version,
        // What the installed bundle calls itself: a node gone from the registry still shows.
        name: fieldOf(this.definitionField('name')),
        category: fieldOf(this.definitionField('category')),
        description: fieldOf(this.definitionField('description')),
        usage: fieldOf(
          sql<number>`(select count(*) from ${aliasedFrom(w)} inner join ${aliasedFrom(p)} on ${p.id} = ${w.projectId} inner join ${aliasedFrom(v)} on ${v.id} = ${w.currentVersionId} where ${p.organizationId} = ${i.organizationId} and ${usesNode})`.mapWith(
            Number,
          ),
        ),
      })
      .from(i)
      .where(eq(i.organizationId, organizationId))
    return (rows as NodeUsage[]).map((row) => ({ ...row, usage: Number(row.usage) }))
  }

  /** A field of the installed bundle's definition, as text (null when absent). */
  private definitionField(field: 'name' | 'category' | 'description') {
    const bundle = this.table.bundle
    return this.dialect === 'pg'
      ? sql<string | null>`(${bundle}::jsonb #>> ${`{definition,${field}}`})`
      : sql<string | null>`json_extract(${bundle}, ${`$.definition.${field}`})`
  }

  async install(data: {
    id: string
    organizationId: string
    nodeId: string
    version: string
    bundle: string
    installedBy: string
  }): Promise<InstalledNode> {
    const now = new Date().toISOString()
    const row = {
      id: data.id,
      organizationId: data.organizationId,
      nodeId: data.nodeId,
      version: data.version,
      bundle: data.bundle,
      installedBy: data.installedBy,
      installedAt: now,
      updatedAt: now,
    }
    await this.db.insert(this.table).values(row)
    return row
  }

  async uninstall(organizationId: string, nodeId: string): Promise<void> {
    await this.db
      .delete(this.table)
      .where(and(eq(this.table.organizationId, organizationId), eq(this.table.nodeId, nodeId)))
  }

  async listByOrganization(
    organizationId: string,
    pagination?: PaginationParams,
  ): Promise<PaginatedResult<InstalledNode>> {
    const limit = clampLimit(pagination?.limit)
    const conditions = [eq(this.table.organizationId, organizationId)]
    if (pagination?.cursor) {
      const { id: cursorId, timestamp } = decodeCursor(pagination.cursor)
      conditions.push(
        or(
          lt(this.table.installedAt, timestamp),
          and(eq(this.table.installedAt, timestamp), lt(this.table.id, cursorId)),
        )!,
      )
    }
    const rows = await this.db
      .select()
      .from(this.table)
      .where(and(...conditions))
      .orderBy(desc(this.table.installedAt), desc(this.table.id))
      .limit(limit + 1)
    return paginateResults(rows, limit, (r) => r.installedAt)
  }

  async getByOrgAndNodeId(organizationId: string, nodeId: string): Promise<InstalledNode | null> {
    const rows = await this.db
      .select()
      .from(this.table)
      .where(and(eq(this.table.organizationId, organizationId), eq(this.table.nodeId, nodeId)))
      .limit(1)
    return rows[0] ?? null
  }

  async updateBundle(
    organizationId: string,
    nodeId: string,
    data: { version: string; bundle: string },
  ): Promise<InstalledNode> {
    const now = new Date().toISOString()
    await this.db
      .update(this.table)
      .set({ version: data.version, bundle: data.bundle, updatedAt: now })
      .where(and(eq(this.table.organizationId, organizationId), eq(this.table.nodeId, nodeId)))
    const updated = await this.getByOrgAndNodeId(organizationId, nodeId)
    if (!updated) throw new Error(`InstalledNode ${nodeId} not found in org ${organizationId}`)
    return updated
  }
}
