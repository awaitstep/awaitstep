import { eq, desc, inArray } from 'drizzle-orm'
import type { WorkflowRun } from '../types.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTable = any

export class RunsAdapter {
  constructor(private db: AnyTable, private table: AnyTable) {}

  async create(data: { id: string; workflowId: string; versionId: string; connectionId: string; instanceId: string; status: string }): Promise<WorkflowRun> {
    const now = new Date().toISOString()
    const row = {
      id: data.id,
      workflowId: data.workflowId,
      versionId: data.versionId,
      connectionId: data.connectionId,
      instanceId: data.instanceId,
      status: data.status,
      output: null,
      error: null,
      createdAt: now,
      updatedAt: now,
    }
    await this.db.insert(this.table).values(row)
    return row
  }

  async getById(id: string): Promise<WorkflowRun | null> {
    const rows = await this.db.select().from(this.table).where(eq(this.table.id, id)).limit(1)
    return rows[0] ?? null
  }

  async listByWorkflow(workflowId: string): Promise<WorkflowRun[]> {
    return this.db.select().from(this.table).where(eq(this.table.workflowId, workflowId)).orderBy(desc(this.table.createdAt))
  }

  async listByWorkflowIds(workflowIds: string[], limit: number): Promise<WorkflowRun[]> {
    if (workflowIds.length === 0) return []
    return this.db.select().from(this.table).where(inArray(this.table.workflowId, workflowIds)).orderBy(desc(this.table.createdAt)).limit(limit)
  }

  async update(id: string, data: { status?: string; output?: string; error?: string; updatedAt?: string }): Promise<WorkflowRun> {
    const updates = { ...data, updatedAt: data.updatedAt ?? new Date().toISOString() }
    await this.db.update(this.table).set(updates).where(eq(this.table.id, id))
    const updated = await this.getById(id)
    if (!updated) throw new Error(`WorkflowRun ${id} not found`)
    return updated
  }
}
