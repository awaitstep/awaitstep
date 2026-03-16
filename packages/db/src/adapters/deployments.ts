import { eq, desc, inArray } from 'drizzle-orm'
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
    workerName: string
    workerUrl?: string
    status: string
    error?: string
  }): Promise<Deployment> {
    const now = new Date().toISOString()
    const row = {
      id: data.id,
      workflowId: data.workflowId,
      versionId: data.versionId,
      connectionId: data.connectionId,
      workerName: data.workerName,
      workerUrl: data.workerUrl ?? null,
      status: data.status,
      error: data.error ?? null,
      createdAt: now,
    }
    await this.db.insert(this.table).values(row)
    return row
  }

  async listByWorkflow(workflowId: string): Promise<Deployment[]> {
    return this.db.select().from(this.table).where(eq(this.table.workflowId, workflowId)).orderBy(desc(this.table.createdAt))
  }

  async listByWorkflowIds(workflowIds: string[], limit: number): Promise<Deployment[]> {
    if (workflowIds.length === 0) return []
    return this.db.select().from(this.table).where(inArray(this.table.workflowId, workflowIds)).orderBy(desc(this.table.createdAt)).limit(limit)
  }
}
