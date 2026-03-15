import { eq, desc } from 'drizzle-orm'
import type { CFConnection } from '../types.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTable = any

export class ConnectionsAdapter {
  constructor(private db: AnyTable, private table: AnyTable) {}

  async create(data: { id: string; userId: string; accountId: string; apiToken: string; name: string }): Promise<CFConnection> {
    const now = new Date().toISOString()
    const row = {
      id: data.id,
      userId: data.userId,
      accountId: data.accountId,
      apiToken: data.apiToken,
      name: data.name,
      createdAt: now,
      updatedAt: now,
    }
    await this.db.insert(this.table).values(row)
    return row
  }

  async getById(id: string): Promise<CFConnection | null> {
    const rows = await this.db.select().from(this.table).where(eq(this.table.id, id)).limit(1)
    return rows[0] ?? null
  }

  async listByUser(userId: string): Promise<CFConnection[]> {
    return this.db.select().from(this.table).where(eq(this.table.userId, userId)).orderBy(desc(this.table.createdAt))
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(this.table).where(eq(this.table.id, id))
  }
}
