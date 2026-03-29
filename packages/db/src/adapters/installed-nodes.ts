import { eq, and, desc, or, lt } from 'drizzle-orm'
import type { InstalledNode } from '../types.js'
import type { PaginationParams, PaginatedResult } from '../pagination.js'
import { clampLimit, decodeCursor, paginateResults } from '../pagination.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTable = any

export class InstalledNodesAdapter {
  constructor(
    private db: AnyTable,
    private table: AnyTable,
  ) {}

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
