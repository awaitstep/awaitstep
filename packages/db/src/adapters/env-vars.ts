import { eq, desc, and, isNull, inArray, or, lt } from 'drizzle-orm'
import type { EnvVar } from '../types.js'
import { insertWhere } from './insert-where.js'
import type { TokenCrypto } from '../crypto.js'
import type { PaginationParams, PaginatedResult } from '../pagination.js'
import { clampLimit, decodeCursor, paginateResults } from '../pagination.js'

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
    // A project variable is written only if the project is the
    // organization's — checked by the insert itself.
    if (data.projectId && this.projectsTable) {
      const p = this.projectsTable
      const inserted = await insertWhere<EnvVar>(
        this.db,
        this.table,
        row,
        p,
        and(eq(p.id, data.projectId), eq(p.organizationId, data.organizationId))!,
      )
      if (!inserted) return null
    } else {
      await this.db.insert(this.table).values(row)
    }
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

  async listByOrganization(
    organizationId: string,
    pagination?: PaginationParams,
  ): Promise<PaginatedResult<EnvVar>> {
    const limit = clampLimit(pagination?.limit)
    const conditions = [eq(this.table.organizationId, organizationId), isNull(this.table.projectId)]
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
        row.value = await this.tryDecrypt(row.value)
      }
    }
    return paginateResults(rows, limit, (r) => r.createdAt)
  }

  async listByProject(
    organizationId: string,
    projectId: string,
    pagination?: PaginationParams,
  ): Promise<PaginatedResult<EnvVar>> {
    const limit = clampLimit(pagination?.limit)
    const conditions = [
      eq(this.table.organizationId, organizationId),
      eq(this.table.projectId, projectId),
    ]
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
        row.value = await this.tryDecrypt(row.value)
      }
    }
    return paginateResults(rows, limit, (r) => r.createdAt)
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

  /**
   * Every variable in this organization matching one of `names`, from the
   * project and from the org, in one query.
   *
   * Both scopes together because a reference resolves against either, and
   * one query because the caller is resolving a whole workflow's worth of
   * names: a lookup per name per scope is 2N round trips for something a
   * single `IN` answers.
   */
  async findByNames(
    organizationId: string,
    names: readonly string[],
    projectId?: string | null,
  ): Promise<EnvVar[]> {
    if (names.length === 0) return []
    const scope = projectId
      ? or(eq(this.table.projectId, projectId), isNull(this.table.projectId))
      : isNull(this.table.projectId)
    const rows: EnvVar[] = await this.db
      .select()
      .from(this.table)
      .where(
        and(
          eq(this.table.organizationId, organizationId),
          inArray(this.table.name, [...names]),
          scope,
        ),
      )
    if (!this.crypto) return rows
    return Promise.all(
      rows.map(async (row) => ({ ...row, value: await this.tryDecrypt(row.value) })),
    )
  }

  /**
   * One statement: the ownership check — organization, and the project when
   * the caller is pinned to one — rides in the WHERE instead of a prior read.
   * `scope.projectId` of `null` restricts to org-wide rows; leaving it out
   * means any row of the organization.
   */
  async update(
    id: string,
    scope: { organizationId: string; projectId?: string | null },
    data: { name?: string; value?: string; isSecret?: boolean },
  ): Promise<EnvVar | null> {
    const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() }
    if (data.name !== undefined) updates.name = data.name
    if (data.value !== undefined) {
      updates.value = this.crypto ? await this.crypto.encrypt(data.value) : data.value
    }
    if (data.isSecret !== undefined) updates.isSecret = data.isSecret

    const conditions = [eq(this.table.id, id), eq(this.table.organizationId, scope.organizationId)]
    if (scope.projectId !== undefined) {
      conditions.push(
        scope.projectId === null
          ? isNull(this.table.projectId)
          : eq(this.table.projectId, scope.projectId),
      )
    }
    // A stored secret must not become readable by flipping the flag: without
    // a replacement value, the update applies only to rows that are already
    // non-secret. The caller tells this refusal from a miss on the error path.
    if (data.isSecret === false && data.value === undefined) {
      conditions.push(eq(this.table.isSecret, false))
    }

    const rows = await this.db
      .update(this.table)
      .set(updates)
      .where(and(...conditions))
      .returning()
    const row = rows[0] ?? null
    if (row && this.crypto) {
      row.value = await this.tryDecrypt(row.value)
    }
    return row
  }

  async delete(
    id: string,
    scope: { organizationId: string; projectId?: string | null },
  ): Promise<boolean> {
    const conditions = [eq(this.table.id, id), eq(this.table.organizationId, scope.organizationId)]
    if (scope.projectId !== undefined) {
      conditions.push(
        scope.projectId === null
          ? isNull(this.table.projectId)
          : eq(this.table.projectId, scope.projectId),
      )
    }
    const rows = await this.db
      .delete(this.table)
      .where(and(...conditions))
      .returning({ id: this.table.id })
    return rows.length > 0
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
