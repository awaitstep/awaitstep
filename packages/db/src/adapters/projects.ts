import { eq, desc } from 'drizzle-orm'
import type { Project } from '../types.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTable = any

export class ProjectsAdapter {
  constructor(private db: AnyTable, private table: AnyTable) {}

  async create(data: { id: string; organizationId: string; name: string; slug: string; description?: string }): Promise<Project> {
    const now = new Date().toISOString()
    const row = {
      id: data.id,
      organizationId: data.organizationId,
      name: data.name,
      slug: data.slug,
      description: data.description ?? null,
      createdAt: now,
      updatedAt: now,
    }
    await this.db.insert(this.table).values(row)
    return row
  }

  async getById(id: string): Promise<Project | null> {
    const rows = await this.db.select().from(this.table).where(eq(this.table.id, id)).limit(1)
    return rows[0] ?? null
  }

  async listByOrganization(organizationId: string): Promise<Project[]> {
    return this.db.select().from(this.table).where(eq(this.table.organizationId, organizationId)).orderBy(desc(this.table.createdAt))
  }

  async update(id: string, data: { name?: string; slug?: string; description?: string }): Promise<Project> {
    const now = new Date().toISOString()
    await this.db.update(this.table).set({ ...data, updatedAt: now }).where(eq(this.table.id, id))
    const updated = await this.getById(id)
    if (!updated) throw new Error(`Project ${id} not found`)
    return updated
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(this.table).where(eq(this.table.id, id))
  }
}
