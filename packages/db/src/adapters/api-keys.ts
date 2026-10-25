import { eq, desc, isNull, and, or, lt, inArray, sql, type SQL } from 'drizzle-orm'
import type { ApiKey, ApiKeyAuth, ApiKeyListItem } from '../types.js'
import type { PaginationParams, PaginatedResult } from '../pagination.js'
import { clampLimit, decodeCursor, paginateResults } from '../pagination.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTable = any

export class ApiKeysAdapter {
  constructor(
    private db: AnyTable,
    private table: AnyTable,
    private projectsTable: AnyTable,
    private memberTable?: AnyTable,
  ) {}

  /**
   * "This key belongs to the organization" — its own column, or through its
   * project. One definition for revoke and list, and both halves can use the
   * project/organization indexes.
   */
  private ownedByOrg(organizationId: string): SQL {
    const p = this.projectsTable
    return or(
      eq(this.table.organizationId, organizationId),
      inArray(
        this.table.projectId,
        this.db.select({ id: p.id }).from(p).where(eq(p.organizationId, organizationId)),
      ),
    )!
  }

  /**
   * Creates a key of exactly one level: with `projectId` the project must
   * belong to `organizationId` (validated here, like createEnvVar) and the
   * row stores the project; without, the row stores the organization. Null
   * when the project is not the organization's.
   */
  async create(data: {
    id: string
    organizationId: string
    projectId?: string | null
    createdBy: string
    name: string
    keyHash: string
    keyPrefix: string
    scopes: string
    expiresAt?: string | null
  }): Promise<ApiKey | null> {
    if (data.projectId) {
      const p = this.projectsTable
      const valid = await this.db
        .select({ id: p.id })
        .from(p)
        .where(and(eq(p.id, data.projectId), eq(p.organizationId, data.organizationId)))
        .limit(1)
      if (valid.length === 0) return null
    }

    const now = new Date().toISOString()
    const row = {
      id: data.id,
      projectId: data.projectId ?? null,
      organizationId: data.projectId ? null : data.organizationId,
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

  async getById(id: string): Promise<ApiKey | null> {
    const rows = await this.db.select().from(this.table).where(eq(this.table.id, id)).limit(1)
    return rows[0] ?? null
  }

  /**
   * Everything auth needs in one read: the key, its organization (own or its
   * project's) and whether its creator is still a member there. Without a
   * member table in the schema, membership is not tracked and reads as true —
   * the same posture as isOrgMember.
   */
  async getAuthByHash(keyHash: string): Promise<ApiKeyAuth | null> {
    const k = this.table
    const p = this.projectsTable
    const m = this.memberTable
    const orgExpr = sql`coalesce(${k.organizationId}, ${p.organizationId})`

    let query = this.db
      .select({
        key: k,
        projectOrganizationId: p.organizationId,
        ...(m ? { memberId: m.id } : {}),
      })
      .from(k)
      .leftJoin(p, eq(k.projectId, p.id))
    if (m) {
      query = query.leftJoin(m, and(eq(m.userId, k.createdBy), eq(m.organizationId, orgExpr)))
    }
    const rows = await query.where(and(eq(k.keyHash, keyHash), isNull(k.revokedAt))).limit(1)

    const row = rows[0]
    if (!row) return null
    return {
      ...row.key,
      resolvedOrganizationId: row.key.organizationId ?? row.projectOrganizationId ?? null,
      createdByIsMember: m ? row.memberId != null : true,
    }
  }

  /**
   * Live keys of the organization — both levels — with each project key's
   * project name joined in (the join is for the name only; the ownership
   * check stays on the indexed condition). Revoked keys never leave the
   * database: they are history, not something a list pages through.
   */
  async listByOrganization(
    organizationId: string,
    pagination?: PaginationParams,
  ): Promise<PaginatedResult<ApiKeyListItem>> {
    const k = this.table
    const p = this.projectsTable
    const limit = clampLimit(pagination?.limit)
    const conditions = [this.ownedByOrg(organizationId), isNull(k.revokedAt)]
    if (pagination?.cursor) {
      const { id: cursorId, timestamp } = decodeCursor(pagination.cursor)
      conditions.push(
        or(lt(k.createdAt, timestamp), and(eq(k.createdAt, timestamp), lt(k.id, cursorId)))!,
      )
    }
    const rows = await this.db
      .select({ key: k, projectName: p.name })
      .from(k)
      .leftJoin(p, eq(k.projectId, p.id))
      .where(and(...conditions))
      .orderBy(desc(k.createdAt), desc(k.id))
      .limit(limit + 1)
    const items: ApiKeyListItem[] = rows.map(
      (row: { key: ApiKey; projectName: string | null }) => ({
        ...row.key,
        projectName: row.projectName ?? null,
      }),
    )
    return paginateResults(items, limit, (r) => r.createdAt)
  }

  /**
   * One project's live keys. The inner join carries the organization check:
   * a project id from another organization matches nothing.
   */
  async listByProject(
    organizationId: string,
    projectId: string,
    pagination?: PaginationParams,
  ): Promise<PaginatedResult<ApiKeyListItem>> {
    const k = this.table
    const p = this.projectsTable
    const limit = clampLimit(pagination?.limit)
    const conditions = [
      eq(k.projectId, projectId),
      eq(p.organizationId, organizationId),
      isNull(k.revokedAt),
    ]
    if (pagination?.cursor) {
      const { id: cursorId, timestamp } = decodeCursor(pagination.cursor)
      conditions.push(
        or(lt(k.createdAt, timestamp), and(eq(k.createdAt, timestamp), lt(k.id, cursorId)))!,
      )
    }
    const rows = await this.db
      .select({ key: k, projectName: p.name })
      .from(k)
      .innerJoin(p, eq(k.projectId, p.id))
      .where(and(...conditions))
      .orderBy(desc(k.createdAt), desc(k.id))
      .limit(limit + 1)
    const items: ApiKeyListItem[] = rows.map((row: { key: ApiKey; projectName: string }) => ({
      ...row.key,
      projectName: row.projectName,
    }))
    return paginateResults(items, limit, (r) => r.createdAt)
  }

  async updateLastUsed(id: string, lastUsedAt: string): Promise<void> {
    await this.db.update(this.table).set({ lastUsedAt }).where(eq(this.table.id, id))
  }

  /** Revokes within the organization — the key's own, or its project's. */
  async revoke(id: string, organizationId: string): Promise<ApiKey | null> {
    const now = new Date().toISOString()
    const rows = await this.db
      .update(this.table)
      .set({ revokedAt: now })
      .where(and(eq(this.table.id, id), this.ownedByOrg(organizationId)))
      .returning()
    return rows[0] ?? null
  }
}
