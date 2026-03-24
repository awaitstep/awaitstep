import { eq, desc, and, isNull } from 'drizzle-orm'
import type { EnvVar } from '../types.js'
import type { TokenCrypto } from '../crypto.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTable = any

export class EnvVarsAdapter {
  constructor(
    private db: AnyTable,
    private table: AnyTable,
    private crypto?: TokenCrypto,
    private projectsTable?: AnyTable,
  ) {}

  async create(data: {
    id: string
    organizationId: string
    projectId?: string | null
    createdBy: string
    name: string
    value: string
    isSecret: boolean
  }): Promise<EnvVar | null> {
    const now = new Date().toISOString()
    const encryptedValue = this.crypto ? await this.crypto.encrypt(data.value) : data.value

    // If projectId is provided, validate it belongs to the org in a single statement
    if (data.projectId && this.projectsTable) {
      const p = this.projectsTable
      const valid = await this.db
        .select({ id: p.id })
        .from(p)
        .where(and(eq(p.id, data.projectId), eq(p.organizationId, data.organizationId)))
        .limit(1)
      if (valid.length === 0) return null
    }

    const row = {
      id: data.id,
      organizationId: data.organizationId,
      projectId: data.projectId ?? null,
      createdBy: data.createdBy,
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

  async listByOrganization(organizationId: string): Promise<EnvVar[]> {
    const rows = await this.db
      .select()
      .from(this.table)
      .where(and(eq(this.table.organizationId, organizationId), isNull(this.table.projectId)))
      .orderBy(desc(this.table.createdAt))
    if (this.crypto) {
      for (const row of rows) {
        row.value = await this.tryDecrypt(row.value)
      }
    }
    return rows
  }

  async listByProject(organizationId: string, projectId: string): Promise<EnvVar[]> {
    const rows = await this.db
      .select()
      .from(this.table)
      .where(
        and(eq(this.table.organizationId, organizationId), eq(this.table.projectId, projectId)),
      )
      .orderBy(desc(this.table.createdAt))
    if (this.crypto) {
      for (const row of rows) {
        row.value = await this.tryDecrypt(row.value)
      }
    }
    return rows
  }

  async getByOrgAndName(
    organizationId: string,
    name: string,
    projectId?: string | null,
  ): Promise<EnvVar | null> {
    const conditions = projectId
      ? and(
          eq(this.table.organizationId, organizationId),
          eq(this.table.projectId, projectId),
          eq(this.table.name, name),
        )
      : and(
          eq(this.table.organizationId, organizationId),
          isNull(this.table.projectId),
          eq(this.table.name, name),
        )
    const rows = await this.db.select().from(this.table).where(conditions).limit(1)
    const row = rows[0] ?? null
    if (row && this.crypto) {
      row.value = await this.tryDecrypt(row.value)
    }
    return row
  }

  async update(
    id: string,
    data: { name?: string; value?: string; isSecret?: boolean },
  ): Promise<EnvVar | null> {
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
