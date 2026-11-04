import { eq, desc, isNull, and, or, lt, gt, sql, aliasedTable, type SQL } from 'drizzle-orm'
import type {
  ApiKey,
  ApiKeyAuth,
  ApiKeyListItem,
  ApiKeyProjectScope,
  ApiKeyScopedRows,
  ApiKeyScopeTarget,
  ApiKeyTarget,
  ApiKeyWorkspaceScope,
  CreateApiKeyData,
  WorkspaceChip,
  WorkspaceKeyCount,
} from '../types.js'
import { atomicallyReturning } from './atomic.js'
import {
  aliasedFrom,
  idList,
  isoText,
  jsonArrayOf,
  jsonArrayOfValues,
  readJsonArray,
  type Dialect,
} from './json-array.js'
import type { PaginationParams, PaginatedResult } from '../pagination.js'
import { clampLimit, decodeCursor, paginateResults } from '../pagination.js'
import type { RoleFields } from './role-fields.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTable = any

/** The tables keys are written and read with; the access ones are absent in app-only test schemas. */
export interface ApiKeyTables {
  apiKeys: AnyTable
  apiKeyProjects: AnyTable
  apiKeyWorkspaces: AnyTable
  projects: AnyTable
  workspaces?: AnyTable
  user?: AnyTable
  member?: AnyTable
  projectMembers?: AnyTable
  workspaceMembers?: AnyTable
}

/** A scope-set row as the JSON aggregate carries it back. */
interface ProjectScopeRow {
  projectId: string
  projectName: string | null
  projectSlug: string | null
  revokedAt: string | null
}
interface WorkspaceScopeRow {
  id: string
  slug: string
  name: string
  colour: string
  revokedAt: string | null
}
interface ListedRow {
  key: ApiKey
  createdByName: string | null
  projectScopes: unknown
  workspaceScopes: unknown
  // The TRUE scope counts (restriction can truncate the sets above, so the
  // own/reaching split reads these, never the possibly-narrowed scope arrays).
  projectCount: number
  workspaceCount: number
}

/**
 * Narrows the named scope set a listing discloses to a single slice. A
 * consumer that is not an organization admin may see only its own slice of a
 * bundle reaching it, never the sibling projects/workspaces it also reaches.
 */
interface ScopeRestriction {
  projectId?: SQL | unknown
  workspaceId?: SQL | unknown
}

/**
 * API keys at three levels. A key carries one organization (its binding),
 * one `level` (which @awaitstep/ir catalog it is checked by), and a SET of
 * scopes in a join table: `api_key_projects` for a project-level key,
 * `api_key_workspaces` for a workspace-level key, none for an organization
 * key. Each scope row carries its own `revoked_at`, so a project (or
 * workspace) revokes its own access without touching the others; the key
 * dies when its last live scope is revoked. A single-scope key is a set of
 * one — the same code path.
 *
 * A key's HOME — the page it is managed from — is its level's place when its
 * scope set is one, and one level up when it is more than one: a multi-project
 * key lives at the organization, a multi-workspace key at its project. Home is
 * read off the TOTAL number of scope rows (revoked included), which a revoke
 * never changes, so a key never migrates pages as consumers drop out.
 */
export class ApiKeysAdapter {
  private table: AnyTable

  constructor(
    private db: AnyTable,
    private t: ApiKeyTables,
    private dialect: Dialect,
    private roles?: RoleFields,
  ) {
    this.table = t.apiKeys
  }

  // ---- scope-set SQL fragments --------------------------------------------

  /** EXISTS a live (unrevoked) project slice of key `kId` for `projectId`. */
  private liveProjectSlice(kId: SQL | unknown, projectId: SQL | unknown): SQL {
    const a = aliasedTable(this.t.apiKeyProjects, 'lps')
    return sql`exists (select 1 from ${aliasedFrom(a)} where ${a.keyId} = ${kId} and ${a.projectId} = ${projectId} and ${a.revokedAt} is null)`
  }

  /** EXISTS a live workspace slice of key `kId` for `workspaceId`. */
  private liveWorkspaceSlice(kId: SQL | unknown, workspaceId: SQL | unknown): SQL {
    const a = aliasedTable(this.t.apiKeyWorkspaces, 'lws')
    return sql`exists (select 1 from ${aliasedFrom(a)} where ${a.keyId} = ${kId} and ${a.workspaceId} = ${workspaceId} and ${a.revokedAt} is null)`
  }

  /** How many project rows key `kId` has in all (revoked included): its home turns on >1. */
  private totalProjectCount(kId: SQL | unknown): SQL<number> {
    const a = aliasedTable(this.t.apiKeyProjects, 'tpc')
    return sql<number>`(select count(*) from ${aliasedFrom(a)} where ${a.keyId} = ${kId})`.mapWith(
      Number,
    )
  }

  private totalWorkspaceCount(kId: SQL | unknown): SQL<number> {
    const a = aliasedTable(this.t.apiKeyWorkspaces, 'twc')
    return sql<number>`(select count(*) from ${aliasedFrom(a)} where ${a.keyId} = ${kId})`.mapWith(
      Number,
    )
  }

  /** The single project of a one-project key, as a scalar — for home-at-project checks. */
  private soleProjectId(kId: SQL | unknown): SQL {
    const a = aliasedTable(this.t.apiKeyProjects, 'spi')
    return sql`(select ${a.projectId} from ${aliasedFrom(a)} where ${a.keyId} = ${kId} limit 1)`
  }

  private soleWorkspaceId(kId: SQL | unknown): SQL {
    const a = aliasedTable(this.t.apiKeyWorkspaces, 'swi')
    return sql`(select ${a.workspaceId} from ${aliasedFrom(a)} where ${a.keyId} = ${kId} limit 1)`
  }

  /**
   * Whether workspace-level key `kId` belongs to project `projectId` — its
   * workspaces are all of one project, so a multi-workspace key's home is that
   * project. One matching workspace is enough.
   */
  private workspaceKeyInProject(kId: SQL | unknown, projectId: SQL | unknown): SQL {
    const a = aliasedTable(this.t.apiKeyWorkspaces, 'wkp')
    const w = aliasedTable(this.t.workspaces, 'wkpw')
    return sql`exists (select 1 from ${aliasedFrom(a)} inner join ${aliasedFrom(w)} on ${w.id} = ${a.workspaceId} where ${a.keyId} = ${kId} and ${w.projectId} = ${projectId})`
  }

  /**
   * The project a workspace-level key belongs to (its workspaces are all of
   * one project), from a live, creator-accessible workspace; null otherwise.
   * Request-time auth carries it so a workspace key's reads stay confined to
   * its project even on org-level routes it reaches through its cells.
   */
  private workspaceKeyProjectId(kId: SQL | unknown, createdBy: SQL | unknown): SQL {
    const a = aliasedTable(this.t.apiKeyWorkspaces, 'wkpr')
    const w = aliasedTable(this.t.workspaces, 'wkprw')
    const p = aliasedTable(this.t.projects, 'wkprp')
    const access = this.roles
      ? sql` and ${this.roles.workspaceRoleOf(createdBy, { organizationId: p.organizationId, projectId: p.id, workspaceId: a.workspaceId })} is not null`
      : sql``
    return sql`(select ${w.projectId} from ${aliasedFrom(a)} inner join ${aliasedFrom(w)} on ${w.id} = ${a.workspaceId} inner join ${aliasedFrom(p)} on ${p.id} = ${w.projectId} where ${a.keyId} = ${kId} and ${a.revokedAt} is null${access} limit 1)`
  }

  /**
   * Live project ids of key `kId` that its creator can STILL open — what
   * request-time auth matches against. A slice the creator lost access to
   * drops out, so a key whose creator can open none of its scopes authorizes
   * nothing (the middleware refuses an empty set), closing even the org-level
   * reads it held through its cells.
   */
  private liveProjectIdsJson(kId: SQL | unknown, createdBy: SQL | unknown): SQL<string> {
    const a = aliasedTable(this.t.apiKeyProjects, 'lpj')
    const p = aliasedTable(this.t.projects, 'lpjp')
    const access = this.roles
      ? sql` and ${this.roles.projectVisible(createdBy, { organizationId: p.organizationId, projectId: a.projectId })}`
      : sql``
    return sql<string>`(select ${jsonArrayOfValues(this.dialect, sql`${a.projectId}`)} from ${aliasedFrom(a)} inner join ${aliasedFrom(p)} on ${p.id} = ${a.projectId} where ${a.keyId} = ${kId} and ${a.revokedAt} is null${access})`
  }

  private liveWorkspaceIdsJson(kId: SQL | unknown, createdBy: SQL | unknown): SQL<string> {
    const a = aliasedTable(this.t.apiKeyWorkspaces, 'lwj')
    const w = aliasedTable(this.t.workspaces, 'lwjw')
    const p = aliasedTable(this.t.projects, 'lwjp')
    const access = this.roles
      ? sql` and ${this.roles.workspaceRoleOf(createdBy, { organizationId: p.organizationId, projectId: p.id, workspaceId: a.workspaceId })} is not null`
      : sql``
    return sql<string>`(select ${jsonArrayOfValues(this.dialect, sql`${a.workspaceId}`)} from ${aliasedFrom(a)} inner join ${aliasedFrom(w)} on ${w.id} = ${a.workspaceId} inner join ${aliasedFrom(p)} on ${p.id} = ${w.projectId} where ${a.keyId} = ${kId} and ${a.revokedAt} is null${access})`
  }

  /**
   * A listed key's project scope set (revoked rows included), named. Full by
   * default; `onlyProjectId` narrows it to that single slice — all a consumer
   * that is not an organization admin may see of a bundle reaching it, so the
   * sibling projects the bundle also reaches are not disclosed to it.
   */
  private projectScopeSetJson(kId: SQL | unknown, onlyProjectId?: SQL | unknown): SQL<string> {
    const a = aliasedTable(this.t.apiKeyProjects, 'psa')
    const p = aliasedTable(this.t.projects, 'psp')
    const only = onlyProjectId === undefined ? sql`` : sql` and ${a.projectId} = ${onlyProjectId}`
    return sql<string>`(select ${jsonArrayOf(
      this.dialect,
      {
        projectId: sql`${a.projectId}`,
        projectName: sql`${p.name}`,
        projectSlug: sql`${p.slug}`,
        revokedAt: isoText(this.dialect, a.revokedAt),
      },
      sql`${p.name}`,
    )} from ${aliasedFrom(a)} left join ${aliasedFrom(p)} on ${p.id} = ${a.projectId} where ${a.keyId} = ${kId}${only})`
  }

  /**
   * A listed key's workspace scope set (revoked rows included), named. Full by
   * default; `onlyWorkspaceId` narrows it to that single slice — all a consumer
   * that is not an organization admin may see of a bundle reaching it, so the
   * sibling workspaces the bundle also reaches are not disclosed to it.
   */
  private workspaceScopeSetJson(kId: SQL | unknown, onlyWorkspaceId?: SQL | unknown): SQL<string> {
    const a = aliasedTable(this.t.apiKeyWorkspaces, 'wsa')
    const w = aliasedTable(this.t.workspaces, 'wsw')
    const only =
      onlyWorkspaceId === undefined ? sql`` : sql` and ${a.workspaceId} = ${onlyWorkspaceId}`
    return sql<string>`(select ${jsonArrayOf(
      this.dialect,
      {
        id: sql`${w.id}`,
        slug: sql`${w.slug}`,
        name: sql`${w.name}`,
        colour: sql`${w.colour}`,
        revokedAt: isoText(this.dialect, a.revokedAt),
      },
      sql`${w.name}`,
    )} from ${aliasedFrom(a)} left join ${aliasedFrom(w)} on ${w.id} = ${a.workspaceId} where ${a.keyId} = ${kId}${only})`
  }

  // ---- create -------------------------------------------------------------

  /**
   * Mints a key with its whole scope set. An organization key is written as
   * is. A project/workspace key is minted only if its creator can open EVERY
   * scope in the set (all-or-nothing); the key row and all its scope rows are
   * written as one unit. Null when the creator fails the authorization — the
   * request-time scope middleware re-checks each place per request.
   */
  async create(data: CreateApiKeyData): Promise<ApiKey | null> {
    const row: ApiKey = {
      id: data.id,
      organizationId: data.organizationId,
      level: data.level,
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

    const authorized =
      data.level === 'project'
        ? await this.creatorOpensAllProjects(data.createdBy, data.organizationId, data.projectIds)
        : await this.creatorOpensAllWorkspaces(
            data.createdBy,
            data.organizationId,
            data.projectId,
            data.workspaceIds,
          )
    if (!authorized) return null

    const scopeTable = data.level === 'project' ? this.t.apiKeyProjects : this.t.apiKeyWorkspaces
    const scopeRows =
      data.level === 'project'
        ? data.projectIds.map((projectId) => ({ keyId: data.id, projectId, revokedAt: null }))
        : data.workspaceIds.map((workspaceId) => ({ keyId: data.id, workspaceId, revokedAt: null }))

    await atomicallyReturning(this.db, (tx) => [
      tx.insert(this.table).values(row).returning(),
      tx.insert(scopeTable).values(scopeRows).returning(),
    ])
    return row
  }

  /** Whether `who` can open every one of `projectIds`, all in `organizationId`. */
  private async creatorOpensAllProjects(
    who: string,
    organizationId: string,
    projectIds: string[],
  ): Promise<boolean> {
    const want = new Set(projectIds).size
    if (want === 0) return false
    const p = this.t.projects
    const open = this.roles
      ? this.roles.projectVisible(who, { organizationId: p.organizationId, projectId: p.id })
      : undefined
    const rows = await this.db
      .select({ c: sql<number>`count(*)`.mapWith(Number) })
      .from(p)
      .where(
        and(
          sql`${p.id} in ${idList(this.dialect, projectIds)}`,
          eq(p.organizationId, organizationId),
          open,
        ),
      )
    return (rows[0]?.c ?? 0) === want
  }

  /** Whether `who` can open every one of `workspaceIds`, all in `projectId`, whose org is `organizationId`. */
  private async creatorOpensAllWorkspaces(
    who: string,
    organizationId: string,
    projectId: string,
    workspaceIds: string[],
  ): Promise<boolean> {
    const want = new Set(workspaceIds).size
    if (want === 0 || !this.t.workspaces) return false
    const w = this.t.workspaces
    const p = this.t.projects
    const open = this.roles
      ? sql`${this.roles.workspaceRoleOf(who, {
          organizationId: p.organizationId,
          projectId: p.id,
          workspaceId: w.id,
        })} is not null`
      : undefined
    const rows = await this.db
      .select({ c: sql<number>`count(*)`.mapWith(Number) })
      .from(w)
      .innerJoin(p, eq(p.id, w.projectId))
      .where(
        and(
          sql`${w.id} in ${idList(this.dialect, workspaceIds)}`,
          eq(w.projectId, projectId),
          eq(p.organizationId, organizationId),
          open,
        ),
      )
    return (rows[0]?.c ?? 0) === want
  }

  async getById(id: string): Promise<ApiKey | null> {
    const rows = await this.db.select().from(this.table).where(eq(this.table.id, id)).limit(1)
    return rows[0] ?? null
  }

  // ---- request-time auth --------------------------------------------------

  /**
   * Everything request-time auth needs in one read: the key, whether its
   * creator is still a member of its organization, whether the key that
   * minted it is still live, and the key's LIVE scope set (the project or
   * workspace ids it still reaches). The addressed place is matched against
   * that set by the scope middleware, which also resolves the creator's
   * standing on the place; a key with no member table reads as a member, the
   * same posture as isOrgMember.
   */
  async getAuthByHash(keyHash: string): Promise<ApiKeyAuth | null> {
    const k = this.table
    const m = this.t.member
    const parent = aliasedTable(k, 'parent_key')

    let query = this.db
      .select({
        key: k,
        parentId: parent.id,
        parentRevokedAt: parent.revokedAt,
        parentExpiresAt: parent.expiresAt,
        projectScopes: this.liveProjectIdsJson(k.id, k.createdBy),
        workspaceScopes: this.liveWorkspaceIdsJson(k.id, k.createdBy),
        keyProjectId: this.workspaceKeyProjectId(k.id, k.createdBy),
        ...(m ? { memberId: m.id, memberRole: m.role } : {}),
      })
      .from(k)
      .leftJoin(parent, eq(k.parentKeyId, parent.id))
    if (m) {
      query = query.leftJoin(
        m,
        and(eq(m.userId, k.createdBy), eq(m.organizationId, k.organizationId)),
      )
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
      createdByIsMember: m ? row.memberId != null : true,
      createdByRole: m ? (row.memberRole ?? null) : null,
      parentKeyLive: parentLive,
      projectScopes: readJsonArray<string>(row.projectScopes),
      workspaceScopes: readJsonArray<string>(row.workspaceScopes),
      keyProjectId: (row.keyProjectId as string | null) ?? null,
    }
  }

  // ---- listing ------------------------------------------------------------

  private listedSelect(restrict?: ScopeRestriction) {
    const k = this.table
    const u = this.t.user ? aliasedTable(this.t.user, 'creator') : null
    return {
      key: k,
      createdByName: u ? u.name : sql<string | null>`null`,
      projectScopes: this.projectScopeSetJson(k.id, restrict?.projectId),
      workspaceScopes: this.workspaceScopeSetJson(k.id, restrict?.workspaceId),
      projectCount: this.totalProjectCount(k.id),
      workspaceCount: this.totalWorkspaceCount(k.id),
    }
  }

  private listedFrom(restrict?: ScopeRestriction) {
    const k = this.table
    const u = this.t.user ? aliasedTable(this.t.user, 'creator') : null
    let q = this.db.select(this.listedSelect(restrict)).from(k)
    if (u) q = q.leftJoin(u, eq(u.id, k.createdBy))
    return q
  }

  private toProjects(raw: unknown): ApiKeyProjectScope[] {
    return readJsonArray<ProjectScopeRow>(raw).map((r) => ({
      projectId: r.projectId,
      projectName: r.projectName ?? null,
      projectSlug: r.projectSlug ?? null,
      revokedAt: r.revokedAt ?? null,
    }))
  }

  private toWorkspaces(raw: unknown): ApiKeyWorkspaceScope[] {
    return readJsonArray<WorkspaceScopeRow>(raw).map((r) => ({
      workspace: { id: r.id, slug: r.slug, name: r.name, colour: r.colour } as WorkspaceChip,
      revokedAt: r.revokedAt ?? null,
    }))
  }

  private item = (row: ListedRow): ApiKeyListItem => ({
    ...row.key,
    createdByName: row.createdByName ?? null,
    projects: this.toProjects(row.projectScopes),
    workspaces: this.toWorkspaces(row.workspaceScopes),
  })

  private cursorCondition(pagination?: PaginationParams): SQL | undefined {
    if (!pagination?.cursor) return undefined
    const k = this.table
    const { id: cursorId, timestamp } = decodeCursor(pagination.cursor)
    return or(lt(k.createdAt, timestamp), and(eq(k.createdAt, timestamp), lt(k.id, cursorId)))!
  }

  /**
   * The keys that LIVE at the organization: its organization-level keys and
   * its multi-project keys (home moves up at a set of >1). Project and
   * workspace keys of a set of one are listed at their own place. Revoked
   * keys are history, not something a list pages through.
   */
  async listByOrganization(
    organizationId: string,
    pagination?: PaginationParams,
  ): Promise<PaginatedResult<ApiKeyListItem>> {
    const k = this.table
    const limit = clampLimit(pagination?.limit)
    const rows: ListedRow[] = await this.listedFrom()
      .where(
        and(
          eq(k.organizationId, organizationId),
          isNull(k.revokedAt),
          or(
            eq(k.level, 'organization'),
            and(eq(k.level, 'project'), sql`${this.totalProjectCount(k.id)} > 1`),
          ),
          this.cursorCondition(pagination),
        ),
      )
      .orderBy(desc(k.createdAt), desc(k.id))
      .limit(limit + 1)
    return paginateResults(rows.map(this.item), limit, (r) => r.createdAt)
  }

  /**
   * A project's keys page: its OWN keys — the single-project keys whose one
   * project is this one, and the multi-workspace keys of this project (both
   * live here) — and the keys REACHING it from elsewhere: multi-project keys
   * with a live slice here, which the project may revoke. Organization keys
   * live at the org and are shown there, not here. With a viewer, a project
   * they cannot open lists nothing. Unless `fullReach` (the viewer is an
   * organization admin), a reaching bundle discloses only its slice here — not
   * the sibling projects it also reaches.
   */
  async listByProject(
    organizationId: string,
    projectId: string,
    visibleTo?: string,
    fullReach = false,
    now: string = new Date().toISOString(),
  ): Promise<ApiKeyScopedRows> {
    const k = this.table
    // Fold the viewer's visibility into the one statement: a project they
    // cannot open lists nothing, without a second round trip.
    let visible: SQL | undefined
    if (visibleTo !== undefined && this.roles) {
      const vp = aliasedTable(this.t.projects, 'vpl')
      visible = sql`exists (select 1 from ${aliasedFrom(vp)} where ${vp.id} = ${projectId} and ${vp.organizationId} = ${organizationId} and ${this.roles.projectVisible(visibleTo, { organizationId: vp.organizationId, projectId: vp.id })})`
    }
    const unexpired = or(isNull(k.expiresAt), gt(k.expiresAt, now))

    // Own = single-project keys for this project, plus multi-workspace keys
    // of this project (their home is the project, >1 workspaces).
    const isOwnProject = and(
      eq(k.level, 'project'),
      sql`${this.totalProjectCount(k.id)} = 1`,
      sql`${this.soleProjectId(k.id)} = ${projectId}`,
    )
    const isOwnWorkspaceKey = and(
      eq(k.level, 'workspace'),
      sql`${this.totalWorkspaceCount(k.id)} > 1`,
      this.workspaceKeyInProject(k.id, projectId),
    )
    // Reaching = multi-project keys with a live slice here (the project may
    // revoke that slice). Organization keys live at the org, shown there. An
    // expired bundle no longer reaches anything, as on the workspace page.
    const isReaching = and(
      eq(k.level, 'project'),
      sql`${this.totalProjectCount(k.id)} > 1`,
      this.liveProjectSlice(k.id, projectId),
      unexpired,
    )
    // A non-admin consumer sees only this project's slice of a reaching bundle.
    const restrict = fullReach ? undefined : { projectId }
    const rows: ListedRow[] = await this.listedFrom(restrict)
      .where(
        and(
          eq(k.organizationId, organizationId),
          isNull(k.revokedAt),
          or(isOwnProject, isOwnWorkspaceKey, isReaching),
          visible,
        ),
      )
      .orderBy(desc(k.createdAt), desc(k.id))
    const items = rows.map(this.item)
    // Own = this project's single-project keys and its workspace keys; reaching
    // = the multi-project bundles. Read the TRUE counts, not the scope arrays,
    // which restriction may have narrowed to the one slice shown here.
    const ownSet = new Set(
      rows.filter((r) => r.key.level === 'workspace' || r.projectCount === 1).map((r) => r.key.id),
    )
    return {
      own: items.filter((i) => ownSet.has(i.id)),
      reaching: items.filter((i) => !ownSet.has(i.id)),
    }
  }

  /**
   * How many live keys reach each workspace of the project — the "Workspace
   * keys" card, matching the workspace page's own list: a workspace-level key
   * with a live slice there, for the workspaces the viewer can open, oldest
   * first, without the empty ones.
   */
  async countByWorkspace(projectId: string, viewerId: string): Promise<WorkspaceKeyCount[]> {
    const w = aliasedTable(this.t.workspaces, 'cw')
    const p = aliasedTable(this.t.projects, 'cp')
    const akw = aliasedTable(this.t.apiKeyWorkspaces, 'ckw')
    const k = aliasedTable(this.table, 'ck')
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
        .innerJoin(akw, and(eq(akw.workspaceId, w.id), isNull(akw.revokedAt)))
        .innerJoin(k, and(eq(k.id, akw.keyId), isNull(k.revokedAt)))
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
   * A workspace's keys page: its OWN keys — workspace-level keys whose single
   * workspace is this one — and the keys REACHING it: multi-workspace keys
   * with a live slice here (the workspace may revoke it), and the project keys
   * that reach its project (read-only, revoked at the project). Organization
   * keys live at the org, shown there. Expired reaching keys are left out.
   * Unless `fullReach` (the viewer is an organization admin), a reaching bundle
   * discloses only its slice here — not the sibling workspaces (or, for a
   * project key, the sibling projects) it also reaches.
   */
  async listByWorkspace(
    workspaceId: string,
    now: string,
    fullReach = false,
  ): Promise<ApiKeyScopedRows> {
    const k = this.table
    const own = aliasedTable(this.t.workspaces, 'own_ws')
    const projectOf = sql`(select ${own.projectId} from ${aliasedFrom(own)} where ${own.id} = ${workspaceId})`
    const unexpired = or(isNull(k.expiresAt), gt(k.expiresAt, now))

    const isOwn = and(
      eq(k.level, 'workspace'),
      sql`${this.totalWorkspaceCount(k.id)} = 1`,
      sql`${this.soleWorkspaceId(k.id)} = ${workspaceId}`,
    )
    const reachesAsWorkspace = and(
      eq(k.level, 'workspace'),
      sql`${this.totalWorkspaceCount(k.id)} > 1`,
      this.liveWorkspaceSlice(k.id, workspaceId),
      unexpired,
    )
    // Reaching = multi-workspace keys with a live slice here, and the project
    // keys that reach its project (read-only). Organization keys live at the
    // org and are shown there, not on every workspace page.
    const reachesAsProject = and(
      eq(k.level, 'project'),
      unexpired,
      sql`${this.liveProjectSlice(k.id, projectOf)}`,
    )

    // A non-admin consumer sees only this workspace's slice of a reaching
    // workspace bundle, and only this project's slice of a reaching project key.
    const restrict = fullReach ? undefined : { projectId: projectOf, workspaceId }
    const rows: ListedRow[] = await this.listedFrom(restrict)
      .where(and(isNull(k.revokedAt), or(isOwn, reachesAsWorkspace, reachesAsProject)))
      .orderBy(desc(k.createdAt), desc(k.id))
    // Own = this workspace's sole-workspace keys; reaching = the multi-workspace
    // bundles and the inherited project keys. Read the TRUE count, not the scope
    // array, which restriction may have narrowed to the one slice shown here.
    const ownSet = new Set(
      rows
        .filter((r) => r.key.level === 'workspace' && r.workspaceCount === 1)
        .map((r) => r.key.id),
    )
    const items = rows.map(this.item)
    return {
      own: items.filter((i) => ownSet.has(i.id)),
      reaching: items.filter((i) => !ownSet.has(i.id)),
    }
  }

  async updateLastUsed(id: string, lastUsedAt: string): Promise<void> {
    await this.db.update(this.table).set({ lastUsedAt }).where(eq(this.table.id, id))
  }

  // ---- revoke -------------------------------------------------------------

  /**
   * The whole-key kill-switch: the owner revokes every scope at once, only
   * from the key's home. An organization target kills the org's own keys and
   * its multi-project keys; a project target kills a project's sole-project
   * keys; a workspace target kills a workspace's sole-workspace keys. So a
   * project admin cannot kill a key homed at the organization. Null when no
   * such live key.
   */
  async revoke(id: string, target: ApiKeyTarget): Promise<ApiKey | null> {
    const k = this.table
    const at =
      target.level === 'organization'
        ? and(
            eq(k.organizationId, target.organizationId),
            or(
              eq(k.level, 'organization'),
              and(eq(k.level, 'project'), sql`${this.totalProjectCount(k.id)} > 1`),
            ),
          )
        : target.level === 'project'
          ? // The project home: its single-project keys, and its multi-workspace keys.
            or(
              and(
                eq(k.level, 'project'),
                sql`${this.totalProjectCount(k.id)} = 1`,
                sql`${this.soleProjectId(k.id)} = ${target.projectId}`,
              ),
              and(
                eq(k.level, 'workspace'),
                sql`${this.totalWorkspaceCount(k.id)} > 1`,
                this.workspaceKeyInProject(k.id, target.projectId),
              ),
            )
          : and(
              eq(k.level, 'workspace'),
              sql`${this.totalWorkspaceCount(k.id)} = 1`,
              sql`${this.soleWorkspaceId(k.id)} = ${target.workspaceId}`,
            )
    const rows = await this.db
      .update(k)
      .set({ revokedAt: new Date().toISOString() })
      .where(and(eq(k.id, id), isNull(k.revokedAt), at))
      .returning()
    return rows[0] ?? null
  }

  /**
   * One consumer revoking its own slice of a shared key: stamp that one scope
   * row, and if it was the key's last live scope, stamp the key dead too —
   * both as one unit. Null when the key had no live slice for that place.
   * Authorization (the caller manages that place) is the route's business.
   */
  async revokeScope(target: ApiKeyScopeTarget): Promise<ApiKey | null> {
    const now = new Date().toISOString()
    const k = this.table
    const scopeTable = target.level === 'project' ? this.t.apiKeyProjects : this.t.apiKeyWorkspaces
    const placeCol = target.level === 'project' ? scopeTable.projectId : scopeTable.workspaceId
    const placeId = target.level === 'project' ? target.projectId : target.workspaceId
    const live =
      target.level === 'project'
        ? sql`exists (select 1 from ${aliasedFrom(aliasedTable(this.t.apiKeyProjects, 'rl'))} where ${sql`rl.key_id`} = ${k.id} and ${sql`rl.revoked_at`} is null)`
        : sql`exists (select 1 from ${aliasedFrom(aliasedTable(this.t.apiKeyWorkspaces, 'rl'))} where ${sql`rl.key_id`} = ${k.id} and ${sql`rl.revoked_at`} is null)`

    const [sliceRows] = await atomicallyReturning<{ keyId: string }>(this.db, (tx) => [
      tx
        .update(scopeTable)
        .set({ revokedAt: now })
        .where(
          and(
            eq(scopeTable.keyId, target.keyId),
            eq(placeCol, placeId),
            isNull(scopeTable.revokedAt),
          ),
        )
        .returning({ keyId: scopeTable.keyId }),
      tx
        .update(k)
        .set({ revokedAt: now })
        .where(and(eq(k.id, target.keyId), isNull(k.revokedAt), sql`not ${live}`))
        .returning({ id: k.id }),
    ])
    if (!sliceRows || sliceRows.length === 0) return null
    return this.getById(target.keyId)
  }
}
