import { eq, desc, isNull, and } from 'drizzle-orm'
import type { ApiKey } from '../types.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTable = any

export class ApiKeysAdapter {
  constructor(
    private db: AnyTable,
    private table: AnyTable,
  ) {}

  async create(data: { id: string; projectId: string; createdBy: string; name: string; keyHash: string; keyPrefix: string; scopes: string; expiresAt?: string | null }): Promise<ApiKey> {
    const now = new Date().toISOString()
    const row = {
      id: data.id,
      projectId: data.projectId,
      createdBy: data.createdBy,
      name: data.name,
      keyHash: data.keyHash,
      keyPrefix: data.keyPrefix,
      scopes: data.scopes,
      expiresAt: data.expiresAt ?? null,
      lastUsedAt: null,
      revokedAt: null,
      createdAt: now,
    }
    await this.db.insert(this.table).values(row)
    return row
  }

  async getByHash(keyHash: string): Promise<ApiKey | null> {
    const rows = await this.db
      .select()
      .from(this.table)
      .where(and(eq(this.table.keyHash, keyHash), isNull(this.table.revokedAt)))
      .limit(1)
    return rows[0] ?? null
  }

  async listByProject(projectId: string): Promise<ApiKey[]> {
    return this.db
      .select()
      .from(this.table)
      .where(eq(this.table.projectId, projectId))
      .orderBy(desc(this.table.createdAt))
  }

  async updateLastUsed(id: string, lastUsedAt: string): Promise<void> {
    await this.db.update(this.table).set({ lastUsedAt }).where(eq(this.table.id, id))
  }

  async revoke(id: string, projectId: string): Promise<ApiKey | null> {
    const now = new Date().toISOString()
    await this.db
      .update(this.table)
      .set({ revokedAt: now })
      .where(and(eq(this.table.id, id), eq(this.table.projectId, projectId)))
    const rows = await this.db
      .select()
      .from(this.table)
      .where(and(eq(this.table.id, id), eq(this.table.projectId, projectId)))
      .limit(1)
    return rows[0] ?? null
  }
}
