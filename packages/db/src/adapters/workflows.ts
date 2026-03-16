import { eq, desc } from 'drizzle-orm'
import type { Workflow } from '../types.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTable = any

export class WorkflowsAdapter {
  constructor(private db: AnyTable, private table: AnyTable) {}

  async create(data: { id: string; userId: string; name: string; description?: string }): Promise<Workflow> {
    const now = new Date().toISOString()
    const row = {
      id: data.id,
      userId: data.userId,
      name: data.name,
      description: data.description ?? null,
      currentVersionId: null,
      createdAt: now,
      updatedAt: now,
    }
    await this.db.insert(this.table).values(row)
    return row
  }

  async getById(id: string): Promise<Workflow | null> {
    const rows = await this.db.select().from(this.table).where(eq(this.table.id, id)).limit(1)
    return rows[0] ?? null
  }

  async listByUser(userId: string): Promise<Workflow[]> {
    return this.db.select().from(this.table).where(eq(this.table.userId, userId)).orderBy(desc(this.table.updatedAt))
  }

  async update(id: string, data: { name?: string; description?: string; currentVersionId?: string | null }): Promise<Workflow> {
    const now = new Date().toISOString()
    await this.db.update(this.table).set({ ...data, updatedAt: now }).where(eq(this.table.id, id))
    const updated = await this.getById(id)
    if (!updated) throw new Error(`Workflow ${id} not found`)
    return updated
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(this.table).where(eq(this.table.id, id))
  }
}
