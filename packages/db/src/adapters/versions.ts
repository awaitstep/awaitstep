import { eq, desc, max } from 'drizzle-orm'
import type { WorkflowVersion } from '../types.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTable = any

export class VersionsAdapter {
  constructor(
    private db: AnyTable,
    private table: AnyTable,
  ) {}

  async create(data: {
    id: string
    workflowId: string
    version: number
    ir: string
    generatedCode?: string
  }): Promise<WorkflowVersion> {
    const now = new Date().toISOString()
    const row = {
      id: data.id,
      workflowId: data.workflowId,
      version: data.version,
      ir: data.ir,
      locked: 0,
      createdAt: now,
    }
    await this.db.insert(this.table).values(row)
    return row
  }

  async getById(id: string): Promise<WorkflowVersion | null> {
    const rows = await this.db.select().from(this.table).where(eq(this.table.id, id)).limit(1)
    return rows[0] ?? null
  }

  async getMaxVersionNumber(workflowId: string): Promise<number> {
    const rows = await this.db
      .select({ max: max(this.table.version) })
      .from(this.table)
      .where(eq(this.table.workflowId, workflowId))
    return rows[0]?.max ?? 0
  }

  async listByWorkflow(workflowId: string): Promise<WorkflowVersion[]> {
    return this.db
      .select()
      .from(this.table)
      .where(eq(this.table.workflowId, workflowId))
      .orderBy(desc(this.table.version))
  }

  async update(
    id: string,
    data: { ir?: string; generatedCode?: string; locked?: number },
  ): Promise<void> {
    await this.db.update(this.table).set(data).where(eq(this.table.id, id))
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(this.table).where(eq(this.table.id, id))
  }
}
