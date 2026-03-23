import { eq, desc, and } from 'drizzle-orm'
import type { Deployment } from '../types.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTable = any

export class DeploymentsAdapter {
  constructor(private db: AnyTable, private table: AnyTable) {}

  async create(data: {
    id: string
    workflowId: string
    versionId: string
    connectionId: string
    serviceName: string
    serviceUrl?: string
    status: string
    error?: string
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
      createdAt: now,
    }
    await this.db.insert(this.table).values(row)
    return row
  }

  async getActiveByWorkflow(workflowId: string): Promise<Deployment | null> {
    const rows = await this.db.select().from(this.table)
      .where(and(eq(this.table.workflowId, workflowId), eq(this.table.status, 'success')))
      .orderBy(desc(this.table.createdAt))
      .limit(1)
    return rows[0] ?? null
  }

  async listByWorkflow(workflowId: string): Promise<Deployment[]> {
    return this.db.select().from(this.table).where(eq(this.table.workflowId, workflowId)).orderBy(desc(this.table.createdAt))
  }

  async deleteByWorkflow(workflowId: string): Promise<void> {
    await this.db.delete(this.table).where(eq(this.table.workflowId, workflowId))
  }
}
