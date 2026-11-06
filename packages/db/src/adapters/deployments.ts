import { eq, desc, and, or, lt, lte, aliasedTable, getTableColumns, sql } from 'drizzle-orm'
import type { Deployment, DeploymentListItem } from '../types.js'
import type { PaginationParams, PaginatedResult } from '../pagination.js'
import { clampLimit, decodeCursor, paginateResults } from '../pagination.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTable = any

export class DeploymentsAdapter {
  constructor(
    private db: AnyTable,
    private table: AnyTable,
    private user: AnyTable,
    private versions: AnyTable,
    private connections: AnyTable,
    private workflows: AnyTable,
    private projects: AnyTable,
  ) {}

  async create(data: {
    id: string
    workflowId: string
    versionId: string
    /** The version's number, kept on the row once the version is deleted. */
    versionNumber: number
    connectionId: string
    serviceName: string
    serviceUrl?: string
    status: string
    error?: string
    configSnapshot?: string
    /** The user who deployed it. */
    createdBy?: string
  }): Promise<Deployment> {
    const now = new Date().toISOString()
    const row = {
      id: data.id,
      workflowId: data.workflowId,
      versionId: data.versionId,
      versionNumber: data.versionNumber,
      connectionId: data.connectionId,
      serviceName: data.serviceName,
      serviceUrl: data.serviceUrl ?? null,
      status: data.status,
      error: data.error ?? null,
      configSnapshot: data.configSnapshot ?? null,
      createdBy: data.createdBy ?? null,
      createdAt: now,
      takenDownAt: null,
      takenDownBy: null,
    }
    await this.db.insert(this.table).values(row)
    return row
  }

  async listByWorkflow(
    workflowId: string,
    pagination?: PaginationParams,
  ): Promise<PaginatedResult<DeploymentListItem>> {
    const limit = clampLimit(pagination?.limit)
    const conditions = [eq(this.table.workflowId, workflowId)]
    if (pagination?.cursor) {
      const { id: cursorId, timestamp } = decodeCursor(pagination.cursor)
      conditions.push(
        or(
          lt(this.table.createdAt, timestamp),
          and(eq(this.table.createdAt, timestamp), lt(this.table.id, cursorId)),
        )!,
      )
    }
    // Who deployed it, which version (its number and lock) and its account's name — only
    // an account of the workflow's organization — in the same statement. A deleted
    // version's number comes from the row itself.
    const wf = aliasedTable(this.workflows, 'dlw')
    const p = aliasedTable(this.projects, 'dlp')
    const c = aliasedTable(this.connections, 'dlc')
    const rows: DeploymentListItem[] = await this.db
      .select({
        ...getTableColumns(this.table),
        createdByName: this.user.name,
        version: sql<
          number | null
        >`coalesce(${this.versions.version}, ${this.table.versionNumber})`,
        versionLocked: this.versions.locked,
        // Named here so a taken-down row on an account the project dropped still says which.
        connectionName: c.name,
      })
      .from(this.table)
      .leftJoin(this.user, eq(this.user.id, this.table.createdBy))
      .leftJoin(this.versions, eq(this.versions.id, this.table.versionId))
      .innerJoin(wf, eq(wf.id, this.table.workflowId))
      .innerJoin(p, eq(p.id, wf.projectId))
      .leftJoin(c, and(eq(c.id, this.table.connectionId), eq(c.organizationId, p.organizationId)))
      .where(and(...conditions))
      .orderBy(desc(this.table.createdAt), desc(this.table.id))
      .limit(limit + 1)
    return paginateResults(rows, limit, (r) => r.createdAt)
  }

  /**
   * Marks the workflow's successful deployments on one account, made before
   * `before`, as taken down — by whom and when. The rows stay as its history.
   */
  async takeDownOnConnection(
    workflowId: string,
    connectionId: string,
    before: string,
    takenDownBy: string | null,
  ): Promise<void> {
    await this.db
      .update(this.table)
      .set({ status: 'taken_down', takenDownAt: new Date().toISOString(), takenDownBy })
      .where(
        and(
          eq(this.table.workflowId, workflowId),
          eq(this.table.connectionId, connectionId),
          eq(this.table.status, 'success'),
          lte(this.table.createdAt, before),
        ),
      )
  }
}
