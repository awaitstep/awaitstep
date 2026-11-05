import { eq, desc, and, or, lt, getTableColumns } from 'drizzle-orm'
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
  ) {}

  async create(data: {
    id: string
    workflowId: string
    versionId: string
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
      connectionId: data.connectionId,
      serviceName: data.serviceName,
      serviceUrl: data.serviceUrl ?? null,
      status: data.status,
      error: data.error ?? null,
      configSnapshot: data.configSnapshot ?? null,
      createdBy: data.createdBy ?? null,
      createdAt: now,
    }
    await this.db.insert(this.table).values(row)
    return row
  }

  async getActiveByWorkflow(workflowId: string): Promise<Deployment | null> {
    const rows = await this.db
      .select()
      .from(this.table)
      .where(and(eq(this.table.workflowId, workflowId), eq(this.table.status, 'success')))
      .orderBy(desc(this.table.createdAt))
      .limit(1)
    return rows[0] ?? null
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
    // Who deployed it and which version (its number and lock), in the same statement.
    const rows: DeploymentListItem[] = await this.db
      .select({
        ...getTableColumns(this.table),
        createdByName: this.user.name,
        version: this.versions.version,
        versionLocked: this.versions.locked,
      })
      .from(this.table)
      .leftJoin(this.user, eq(this.user.id, this.table.createdBy))
      .leftJoin(this.versions, eq(this.versions.id, this.table.versionId))
      .where(and(...conditions))
      .orderBy(desc(this.table.createdAt), desc(this.table.id))
      .limit(limit + 1)
    return paginateResults(rows, limit, (r) => r.createdAt)
  }

  async deleteByWorkflow(workflowId: string): Promise<void> {
    await this.db.delete(this.table).where(eq(this.table.workflowId, workflowId))
  }
}
