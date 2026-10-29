import { eq, desc, isNull, and, or, lt, gt, sql, aliasedTable, type SQL } from 'drizzle-orm'
import type {
  ApiKey,
  ApiKeyAuth,
  ApiKeyListItem,
  ApiKeyTarget,
  CreateApiKeyData,
  WorkspaceKeyCount,
  WorkspaceKeysRows,
} from '../types.js'
import { insertWhere } from './insert-where.js'
import { aliasedFrom } from './json-array.js'
import type { PaginationParams, PaginatedResult } from '../pagination.js'
import { clampLimit, decodeCursor, paginateResults } from '../pagination.js'
import type { RoleFields } from './role-fields.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTable = any

/** The tables keys are written and read with; the access ones are absent in app-only test schemas. */
export interface ApiKeyTables {
  apiKeys: AnyTable
  projects: AnyTable
  workspaces?: AnyTable
  user?: AnyTable
  member?: AnyTable
  projectMembers?: AnyTable
  workspaceMembers?: AnyTable
}

interface ListedRow {
  key: ApiKey
  projectName: string | null
  createdByName: string | null
  workspaceSlug: string | null
  workspaceName: string | null
  workspaceColour: string | null
}

/**
 * API keys at three levels (B3): an organization key carries its
 * organization, a project key its project, a workspace key its workspace
 * and that workspace's project. Every list is one statement; a key is
 * written only where its creator can open, by the insert itself.
 */
export class ApiKeysAdapter {
  private table: AnyTable

  constructor(
    private db: AnyTable,
    private t: ApiKeyTables,
    private roles?: RoleFields,
  ) {
    this.table = t.apiKeys
  }

  /** "The person can open the project": its own aliased lookup, bound by id, with no outer reference. */
  private projectVisibleTo(who: string, projectId: string): SQL {
    const vp = aliasedTable(this.t.projects, 'vp')
    return sql`exists (select 1 from ${aliasedFrom(vp)} where ${vp.id} = ${projectId} and ${this.roles!.projectVisible(who, { organizationId: vp.organizationId, projectId: vp.id })})`
  }

  /** "The person can open the workspace, which is the project's": the same, for a workspace key. */
  private workspaceVisibleTo(who: string, projectId: string, workspaceId: string): SQL {
    const vw = aliasedTable(this.t.workspaces, 'vw')
    const vp = aliasedTable(this.t.projects, 'vp')
    return sql`exists (select 1 from ${aliasedFrom(vw)} inner join ${aliasedFrom(vp)} on ${vp.id} = ${vw.projectId} where ${vw.id} = ${workspaceId} and ${vw.projectId} = ${projectId} and ${this.roles!.workspaceRoleOf(who, { organizationId: vp.organizationId, projectId: vp.id, workspaceId: vw.id })} is not null)`
  }

  /**
   * Creates a key of exactly one level. An organization key is written as
   * is; a project key only if the project is the organization's and its
   * creator can open it; a workspace key only if the workspace is that
   * project's and its creator can open it — each by the insert itself.
   * Null when the check failed.
   */
  async create(data: CreateApiKeyData): Promise<ApiKey | null> {
    const row: ApiKey = {
      id: data.id,
      projectId: data.level === 'organization' ? null : data.projectId,
      organizationId: data.level === 'organization' ? data.organizationId : null,
      workspaceId: data.level === 'workspace' ? data.workspaceId : null,
      parentKeyId: data.parentKeyId ?? null,
      createdBy: data.createdBy,
      name: data.name,
      keyHash: data.keyHash,
      keyPrefix: data.keyPrefix,
      keySuffix: data.keySuffix ?? null,
      scopes: data.scopes,
      permissions: data.permissions,
      expiresAt: data.expiresAt ?? null,
      lastUsedAt: null,
      revokedAt: null,
      createdAt: new Date().toISOString(),
    }
    if (data.level === 'organization') {
      await this.db.insert(this.table).values(row)
      return row
    }
    const p = this.t.projects
    let visible: SQL | undefined
    if (this.roles) {
      visible =
        data.level === 'workspace' && this.t.workspaces
          ? this.workspaceVisibleTo(data.createdBy, data.projectId, data.workspaceId)
          : this.projectVisibleTo(data.createdBy, data.projectId)
    }
    const inserted = await insertWhere<ApiKey>(
      this.db,
      this.table,
      row,
      p,
      and(eq(p.id, data.projectId), eq(p.organizationId, data.organizationId), visible)!,
    )
    return inserted ? row : null
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
   * Only the direct parent is checked: keys no longer mint keys (B3), and
   * before that only organization keys minted, so a chain is never longer
   * than one link.
   */
  async getAuthByHash(keyHash: string): Promise<ApiKeyAuth | null> {
    const k = this.table
    const p = this.t.projects
    const m = this.t.member
    const parent = aliasedTable(k, 'parent_key')
    const orgExpr = sql`coalesce(${k.organizationId}, ${p.organizationId})`
    const pm = this.t.projectMembers ? aliasedTable(this.t.projectMembers, 'creator_pm') : null
    const wm = this.t.workspaceMembers ? aliasedTable(this.t.workspaceMembers, 'creator_wm') : null
    const ws = this.t.workspaces ? aliasedTable(this.t.workspaces, 'creator_ws') : null
    // A workspace key is its creator's standing in that workspace, lent out:
    // one they can no longer open (by any route — org, project or grant) ends it.
    const creatorOpensWorkspace = this.roles
      ? sql<boolean>`case when ${k.workspaceId} is null then true else ${this.roles.workspaceRoleOf(k.createdBy, { organizationId: orgExpr, projectId: k.projectId, workspaceId: k.workspaceId })} is not null end`.mapWith(
          Boolean,
        )
      : null

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
        ...(creatorOpensWorkspace ? { creatorOpensWorkspace } : {}),
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
      createdByCanOpenWorkspace: creatorOpensWorkspace ? Boolean(row.creatorOpensWorkspace) : true,
      parentKeyLive: parentLive,
    }
  }

  /** The listed shape: the row, its project's name, its workspace and who minted it, in one statement. */
  private listed(extra?: SQL) {
    const k = this.table
    const p = this.t.projects
    const u = this.t.user ? aliasedTable(this.t.user, 'creator') : null
    const w = this.t.workspaces ? aliasedTable(this.t.workspaces, 'kw') : null
    let query = this.db
      .select({
        key: k,
        projectName: p.name,
        createdByName: u ? u.name : sql<string | null>`null`,
        workspaceSlug: w ? w.slug : sql<string | null>`null`,
        workspaceName: w ? w.name : sql<string | null>`null`,
        workspaceColour: w ? w.colour : sql<string | null>`null`,
        ...(extra ? { kind: extra } : {}),
      })
      .from(k)
      .leftJoin(p, eq(k.projectId, p.id))
    if (u) query = query.leftJoin(u, eq(u.id, k.createdBy))
    if (w) query = query.leftJoin(w, eq(w.id, k.workspaceId))
    return query
  }

  private item = (row: ListedRow): ApiKeyListItem => ({
    ...row.key,
    projectName: row.projectName ?? null,
    createdByName: row.createdByName ?? null,
    workspace:
      row.key.workspaceId && row.workspaceSlug !== null
        ? {
            id: row.key.workspaceId,
            slug: row.workspaceSlug,
            name: row.workspaceName ?? '',
            colour: row.workspaceColour ?? 'green',
          }
        : null,
  })

  private cursorCondition(pagination?: PaginationParams): SQL | undefined {
    if (!pagination?.cursor) return undefined
    const k = this.table
    const { id: cursorId, timestamp } = decodeCursor(pagination.cursor)
    return or(lt(k.createdAt, timestamp), and(eq(k.createdAt, timestamp), lt(k.id, cursorId)))!
  }

  /**
   * The organization's own keys — organization level only; project and
   * workspace keys are listed at their level. Revoked keys never leave the
   * database: they are history, not something a list pages through.
   */
  async listByOrganization(
    organizationId: string,
    pagination?: PaginationParams,
  ): Promise<PaginatedResult<ApiKeyListItem>> {
    const k = this.table
    const limit = clampLimit(pagination?.limit)
    const rows: ListedRow[] = await this.listed()
      .where(
        and(
          eq(k.organizationId, organizationId),
          isNull(k.revokedAt),
          this.cursorCondition(pagination),
        ),
      )
      .orderBy(desc(k.createdAt), desc(k.id))
      .limit(limit + 1)
    return paginateResults(rows.map(this.item), limit, (r) => r.createdAt)
  }

  /**
   * One project's own keys (project level; its workspaces' keys are listed
   * at each workspace). The organization check is on the project; with a
   * viewer, a project they cannot open lists nothing.
   */
  async listByProject(
    organizationId: string,
    projectId: string,
    pagination?: PaginationParams,
    visibleTo?: string,
  ): Promise<PaginatedResult<ApiKeyListItem>> {
    const k = this.table
    const p = this.t.projects
    const limit = clampLimit(pagination?.limit)
    const rows: ListedRow[] = await this.listed()
      .where(
        and(
          eq(k.projectId, projectId),
          isNull(k.workspaceId),
          eq(p.organizationId, organizationId),
          isNull(k.revokedAt),
          visibleTo !== undefined && this.roles
            ? this.projectVisibleTo(visibleTo, projectId)
            : undefined,
          this.cursorCondition(pagination),
        ),
      )
      .orderBy(desc(k.createdAt), desc(k.id))
      .limit(limit + 1)
    return paginateResults(rows.map(this.item), limit, (r) => r.createdAt)
  }

  /**
   * How many unrevoked keys each workspace of the project holds — the
   * "Workspace keys" card, matching the workspace's own list, expired ones
   * included — for the workspaces the viewer can open, oldest first, without
   * the empty ones.
   */
  async countByWorkspace(projectId: string, viewerId: string): Promise<WorkspaceKeyCount[]> {
    const k = aliasedTable(this.table, 'ck')
    const w = aliasedTable(this.t.workspaces, 'cw')
    const p = aliasedTable(this.t.projects, 'cp')
    const rows: { id: string; slug: string; name: string; colour: string; count: number }[] =
      await this.db
        .select({
          id: w.id,
          slug: w.slug,
          name: w.name,
          colour: w.colour,
          count: sql<number>`count(${k.id})`.mapWith(Number),
        })
        .from(w)
        .innerJoin(p, eq(p.id, w.projectId))
        .innerJoin(k, and(eq(k.workspaceId, w.id), isNull(k.revokedAt)))
        .where(
          and(
            eq(w.projectId, projectId),
            this.roles
              ? sql`${this.roles.workspaceRoleOf(viewerId, { organizationId: p.organizationId, projectId: p.id, workspaceId: w.id })} is not null`
              : undefined,
          ),
        )
        .groupBy(w.id, w.slug, w.name, w.colour, w.createdAt)
        .orderBy(w.createdAt, w.id)
    return rows.map((row) => ({
      workspace: { id: row.id, slug: row.slug, name: row.name, colour: row.colour },
      count: row.count,
    }))
  }

  /**
   * Workspace settings → API keys: the workspace's own unrevoked keys, and
   * the project keys that reach it — unrevoked and unexpired — in one statement.
   */
  async listByWorkspace(workspaceId: string, now: string): Promise<WorkspaceKeysRows> {
    const k = this.table
    const own = aliasedTable(this.t.workspaces, 'own_ws')
    const projectOf = sql`(select ${own.projectId} from ${aliasedFrom(own)} where ${own.id} = ${workspaceId})`
    const kind = sql<string>`case when ${k.workspaceId} is null then 'inherited' else 'own' end`
    const rows: (ListedRow & { kind: string })[] = await this.listed(kind)
      .where(
        and(
          isNull(k.revokedAt),
          or(
            eq(k.workspaceId, workspaceId),
            and(
              isNull(k.workspaceId),
              sql`${k.projectId} = ${projectOf}`,
              or(isNull(k.expiresAt), gt(k.expiresAt, now)),
            ),
          ),
        ),
      )
      .orderBy(desc(k.createdAt), desc(k.id))
    return {
      own: rows.filter((r) => r.kind === 'own').map(this.item),
      inherited: rows.filter((r) => r.kind === 'inherited').map(this.item),
    }
  }

  async updateLastUsed(id: string, lastUsedAt: string): Promise<void> {
    await this.db.update(this.table).set({ lastUsedAt }).where(eq(this.table.id, id))
  }

  /**
   * Revokes a key of the given level at the given place — an organization's
   * own key, a project's own key, a workspace's own key — so a project admin
   * cannot revoke an organization key by id. Null when no such live key.
   */
  async revoke(id: string, target: ApiKeyTarget): Promise<ApiKey | null> {
    const k = this.table
    const at =
      target.level === 'organization'
        ? eq(k.organizationId, target.organizationId)
        : target.level === 'project'
          ? and(eq(k.projectId, target.projectId), isNull(k.workspaceId))
          : eq(k.workspaceId, target.workspaceId)
    const rows = await this.db
      .update(k)
      .set({ revokedAt: new Date().toISOString() })
      .where(and(eq(k.id, id), isNull(k.revokedAt), at))
      .returning()
    return rows[0] ?? null
  }
}
