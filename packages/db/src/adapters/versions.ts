import { eq, desc } from 'drizzle-orm'
import type { WorkflowVersion } from '../types.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTable = any

export class VersionsAdapter {
  constructor(private db: AnyTable, private table: AnyTable) {}

  async create(data: { id: string; workflowId: string; version: number; ir: string; generatedCode?: string }): Promise<WorkflowVersion> {
    const now = new Date().toISOString()
    const row = {
      id: data.id,
      workflowId: data.workflowId,
      version: data.version,
      ir: data.ir,
      generatedCode: data.generatedCode ?? null,
      createdAt: now,
    }
    await this.db.insert(this.table).values(row)
    return row
  }

  async getById(id: string): Promise<WorkflowVersion | null> {
    const rows = await this.db.select().from(this.table).where(eq(this.table.id, id)).limit(1)
    return rows[0] ?? null
  }

  async listByWorkflow(workflowId: string): Promise<WorkflowVersion[]> {
    return this.db.select().from(this.table).where(eq(this.table.workflowId, workflowId)).orderBy(desc(this.table.version))
  }

  async update(id: string, data: { ir?: string; generatedCode?: string }): Promise<void> {
    await this.db.update(this.table).set(data).where(eq(this.table.id, id))
  }
}
