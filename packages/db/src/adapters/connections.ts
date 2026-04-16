import { eq, desc, and, or, lt } from 'drizzle-orm'
import type { Connection } from '../types.js'
import type { TokenCrypto } from '../crypto.js'
import type { PaginationParams, PaginatedResult } from '../pagination.js'
import { clampLimit, decodeCursor, paginateResults } from '../pagination.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTable = any

export class ConnectionsAdapter {
  constructor(
    private db: AnyTable,
    private table: AnyTable,
    private crypto?: TokenCrypto,
  ) {}

  async create(data: {
    id: string
    organizationId: string
    createdBy: string
    provider: string
    credentials: string
    name: string
  }): Promise<Connection> {
    const now = new Date().toISOString()
    const encryptedCredentials = this.crypto
      ? await this.crypto.encrypt(data.credentials)
      : data.credentials
    const row = {
      id: data.id,
      organizationId: data.organizationId,
      createdBy: data.createdBy,
      provider: data.provider,
      name: data.name,
      credentials: encryptedCredentials,
      createdAt: now,
      updatedAt: now,
    }
    await this.db.insert(this.table).values(row)
    return { ...row, credentials: data.credentials }
  }

  async getById(id: string, organizationId?: string): Promise<Connection | null> {
    const conditions = [eq(this.table.id, id)]
    if (organizationId) conditions.push(eq(this.table.organizationId, organizationId))
    const rows = await this.db
      .select()
      .from(this.table)
      .where(and(...conditions))
      .limit(1)
    const row = rows[0] ?? null
    if (row && this.crypto) {
      row.credentials = await this.tryDecrypt(row.credentials)
    }
    return row
  }

  async listByOrganization(
    organizationId: string,
    pagination?: PaginationParams,
  ): Promise<PaginatedResult<Connection>> {
    const limit = clampLimit(pagination?.limit)
    const conditions = [eq(this.table.organizationId, organizationId)]
    if (pagination?.cursor) {
      const { id: cursorId, timestamp } = decodeCursor(pagination.cursor)
      conditions.push(
        or(
          lt(this.table.createdAt, timestamp),
          and(eq(this.table.createdAt, timestamp), lt(this.table.id, cursorId)),
        )!,
      )
    }
    const rows = await this.db
      .select()
      .from(this.table)
      .where(and(...conditions))
      .orderBy(desc(this.table.createdAt), desc(this.table.id))
      .limit(limit + 1)
    if (this.crypto) {
      for (const row of rows) {
        row.credentials = await this.tryDecrypt(row.credentials)
      }
    }
    return paginateResults(rows, limit, (r) => r.createdAt)
  }

  private async tryDecrypt(value: string): Promise<string> {
    if (!this.crypto) return value
    try {
      return await this.crypto.decrypt(value)
    } catch {
      return value
    }
  }

  async update(
    id: string,
    data: { name?: string; credentials?: string },
  ): Promise<Connection | null> {
    const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() }
    if (data.name !== undefined) updates.name = data.name
    if (data.credentials !== undefined) {
      updates.credentials = this.crypto
        ? await this.crypto.encrypt(data.credentials)
        : data.credentials
    }
    await this.db.update(this.table).set(updates).where(eq(this.table.id, id))
    return this.getById(id)
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(this.table).where(eq(this.table.id, id))
  }
}
