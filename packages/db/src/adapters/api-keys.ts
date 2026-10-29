import { eq, desc, isNull, and, or, lt, inArray, sql, aliasedTable, type SQL } from 'drizzle-orm'
import type { ApiKey, ApiKeyAuth, ApiKeyListItem } from '../types.js'
import { insertWhere } from './insert-where.js'
import { aliasedFrom } from './json-array.js'
import type { PaginationParams, PaginatedResult } from '../pagination.js'
import { clampLimit, decodeCursor, paginateResults } from '../pagination.js'
import type { RoleFields } from './role-fields.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTable = any

export class ApiKeysAdapter {
  constructor(
    private db: AnyTable,
    private table: AnyTable,
    private projectsTable: AnyTable,
    private memberTable?: AnyTable,
    private accessTables?: {
      projectMembers: AnyTable
      workspaceMembers: AnyTable
      workspaces: AnyTable
    },
    private roles?: RoleFields,
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
   * belong to `organizationId` and the row stores the project; without, the
   * row stores the organization. `parentKeyId` names the key that minted
   * this one — it stops working when its parent does. Null when the project
   * is not the organization's.
   */
  async create(data: {
    id: string
    organizationId: string
    projectId?: string | null
    parentKeyId?: string | null
    createdBy: string
    name: string
    keyHash: string
    keyPrefix: string
    scopes: string
    expiresAt?: string | null
  }): Promise<ApiKey | null> {
    const row: ApiKey = {
      id: data.id,
      projectId: data.projectId ?? null,
      organizationId: data.projectId ? null : data.organizationId,
      parentKeyId: data.parentKeyId ?? null,
      createdBy: data.createdBy,
      name: data.name,
      keyHash: data.keyHash,
      keyPrefix: data.keyPrefix,
      scopes: data.scopes,
      expiresAt: data.expiresAt ?? null,
      lastUsedAt: null,
      revokedAt: null,
      createdAt: new Date().toISOString(),
    }
    if (!data.projectId) {
      await this.db.insert(this.table).values(row)
      return row
    }
    // A project key is minted only in a project of the organization that
    // its creator can open (B2): a hidden project is not found.
    const p = this.projectsTable
    const inserted = await insertWhere<ApiKey>(
      this.db,
      this.table,
      row,
      p,
      and(
        eq(p.id, data.projectId),
        eq(p.organizationId, data.organizationId),
        this.roles ? this.projectVisibleTo(data.createdBy, data.projectId) : undefined,
      )!,
    )
    return inserted ? row : null
  }

  /** "The person can open the project": its own aliased lookup, bound by id, with no outer reference. */
  private projectVisibleTo(who: string, projectId: string): SQL {
    const vp = aliasedTable(this.projectsTable, 'vp')
    return sql`exists (select 1 from ${aliasedFrom(vp)} where ${vp.id} = ${projectId} and ${this.roles!.projectVisible(who, { organizationId: vp.organizationId, projectId: vp.id })})`
  }

  async getById(id: string): Promise<ApiKey | null> {
    const rows = await this.db.select().from(this.table).where(eq(this.table.id, id)).limit(1)
    return rows[0] ?? null
  }

  /**
   * Everything auth needs in one read: the key, its organization (own or its
   * project's), whether its creator is still a member there, and whether the
   * key that minted it is still live. Without a member table in the schema,
   * membership is not tracked and reads as true — the same posture as
   * isOrgMember.
   *
   * Only the direct parent is checked: only organization-level keys mint,
   * and they mint project-level keys, which cannot mint — so a chain is
   * never longer than one link.
   */
  async getAuthByHash(keyHash: string): Promise<ApiKeyAuth | null> {
    const k = this.table
    const p = this.projectsTable
    const m = this.memberTable
    const parent = aliasedTable(k, 'parent_key')
    const orgExpr = sql`coalesce(${k.organizationId}, ${p.organizationId})`
    const a = this.accessTables
    const pm = a ? aliasedTable(a.projectMembers, 'creator_pm') : null
    const wm = a ? aliasedTable(a.workspaceMembers, 'creator_wm') : null
    const ws = a ? aliasedTable(a.workspaces, 'creator_ws') : null

    let query = this.db
      .select({
        key: k,
        projectOrganizationId: p.organizationId,
        parentId: parent.id,
        parentRevokedAt: parent.revokedAt,
        parentExpiresAt: parent.expiresAt,
        ...(m ? { memberId: m.id, memberRole: m.role } : {}),
        ...(pm ? { creatorProjectGrant: pm.role } : {}),
        ...(wm && ws
          ? {
              creatorHasWorkspaceGrant:
                sql<boolean>`exists (select 1 from ${aliasedFrom(wm)} inner join ${aliasedFrom(ws)} on ${ws.id} = ${wm.workspaceId} where ${ws.projectId} = ${k.projectId} and ${wm.userId} = ${k.createdBy})`.mapWith(
                  Boolean,
                ),
            }
          : {}),
      })
      .from(k)
      .leftJoin(p, eq(k.projectId, p.id))
      .leftJoin(parent, eq(k.parentKeyId, parent.id))
    if (m) {
      query = query.leftJoin(m, and(eq(m.userId, k.createdBy), eq(m.organizationId, orgExpr)))
    }
    if (pm) {
      query = query.leftJoin(pm, and(eq(pm.userId, k.createdBy), eq(pm.projectId, k.projectId)))
    }
    const rows = await query.where(and(eq(k.keyHash, keyHash), isNull(k.revokedAt))).limit(1)

    const row = rows[0]
    if (!row) return null
    const parentLive =
      row.key.parentKeyId == null ||
      (row.parentId != null &&
        row.parentRevokedAt == null &&
        (row.parentExpiresAt == null || Date.parse(row.parentExpiresAt) > Date.now()))
    return {
      ...row.key,
      resolvedOrganizationId: row.key.organizationId ?? row.projectOrganizationId ?? null,
      createdByIsMember: m ? row.memberId != null : true,
      createdByRole: m ? (row.memberRole ?? null) : null,
      createdByProjectGrant: pm ? (row.creatorProjectGrant ?? null) : null,
      createdByHasWorkspaceGrant: wm ? Boolean(row.creatorHasWorkspaceGrant) : false,
      parentKeyLive: parentLive,
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
    visibleTo?: string,
  ): Promise<PaginatedResult<ApiKeyListItem>> {
    const k = this.table
    const p = this.projectsTable
    const limit = clampLimit(pagination?.limit)
    const conditions = [this.ownedByOrg(organizationId), isNull(k.revokedAt)]
    // With a viewer, project keys of projects they cannot open are left out
    // (B2): a hidden project is never named. Organization keys always show.
    if (visibleTo !== undefined && this.roles) {
      const vp = aliasedTable(this.projectsTable, 'vp')
      const visibleProjects = this.db
        .select({ id: vp.id })
        .from(vp)
        .where(
          and(
            eq(vp.organizationId, organizationId),
            this.roles.projectVisible(visibleTo, {
              organizationId: vp.organizationId,
              projectId: vp.id,
            }),
          ),
        )
      conditions.push(or(isNull(k.projectId), inArray(k.projectId, visibleProjects))!)
    }
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
    visibleTo?: string,
  ): Promise<PaginatedResult<ApiKeyListItem>> {
    const k = this.table
    const p = this.projectsTable
    const limit = clampLimit(pagination?.limit)
    const conditions = [
      eq(k.projectId, projectId),
      eq(p.organizationId, organizationId),
      isNull(k.revokedAt),
    ]
    // Only when that person can open the project (B2): a hidden project lists nothing.
    if (visibleTo !== undefined && this.roles) {
      conditions.push(this.projectVisibleTo(visibleTo, projectId))
    }
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
