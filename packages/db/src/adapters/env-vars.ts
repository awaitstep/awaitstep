import { eq, desc, and } from 'drizzle-orm'
import type { EnvVar } from '../types.js'
import type { TokenCrypto } from '../crypto.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTable = any

export class EnvVarsAdapter {
  constructor(
    private db: AnyTable,
    private table: AnyTable,
    private crypto?: TokenCrypto,
  ) {}

  async create(data: { id: string; userId: string; name: string; value: string; isSecret: boolean }): Promise<EnvVar> {
    const now = new Date().toISOString()
    const encryptedValue = this.crypto ? await this.crypto.encrypt(data.value) : data.value
    const row = {
      id: data.id,
      userId: data.userId,
      name: data.name,
      value: encryptedValue,
      isSecret: data.isSecret,
      createdAt: now,
      updatedAt: now,
    }
    await this.db.insert(this.table).values(row)
    return { ...row, value: data.value }
  }

  async getById(id: string): Promise<EnvVar | null> {
    const rows = await this.db.select().from(this.table).where(eq(this.table.id, id)).limit(1)
    const row = rows[0] ?? null
    if (row && this.crypto) {
      row.value = await this.tryDecrypt(row.value)
    }
    return row
  }

  async listByUser(userId: string): Promise<EnvVar[]> {
    const rows = await this.db
      .select()
      .from(this.table)
      .where(eq(this.table.userId, userId))
      .orderBy(desc(this.table.createdAt))
    if (this.crypto) {
      for (const row of rows) {
        row.value = await this.tryDecrypt(row.value)
      }
    }
    return rows
  }

  async getByUserAndName(userId: string, name: string): Promise<EnvVar | null> {
    const rows = await this.db
      .select()
      .from(this.table)
      .where(and(eq(this.table.userId, userId), eq(this.table.name, name)))
      .limit(1)
    const row = rows[0] ?? null
    if (row && this.crypto) {
      row.value = await this.tryDecrypt(row.value)
    }
    return row
  }

  async update(id: string, data: { name?: string; value?: string; isSecret?: boolean }): Promise<EnvVar | null> {
    const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() }
    if (data.name !== undefined) updates.name = data.name
    if (data.value !== undefined) {
      updates.value = this.crypto ? await this.crypto.encrypt(data.value) : data.value
    }
    if (data.isSecret !== undefined) updates.isSecret = data.isSecret
    await this.db.update(this.table).set(updates).where(eq(this.table.id, id))
    return this.getById(id)
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(this.table).where(eq(this.table.id, id))
  }

  private async tryDecrypt(value: string): Promise<string> {
    if (!this.crypto) return value
    try {
      return await this.crypto.decrypt(value)
    } catch {
      return value
    }
  }
}
