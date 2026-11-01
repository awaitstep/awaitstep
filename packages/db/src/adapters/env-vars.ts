import {
  eq,
  desc,
  asc,
  and,
  isNull,
  or,
  lt,
  notExists,
  sql,
  aliasedTable,
  type SQL,
} from 'drizzle-orm'
import type {
  EnvVar,
  OrgEnvVar,
  ResolvedProjectVariable,
  ResolvedWorkspaceVariable,
  VariableLevel,
  VariablePlace,
  VariableReach,
  VariableReachPlace,
  WorkspaceChip,
} from '../types.js'
import { atomicallyReturning } from './atomic.js'
import { insertWhere, insertWhereQuery } from './insert-where.js'
import {
  aliasedFrom,
  fieldOf,
  idList,
  jsonArrayOf,
  readJsonArray,
  type Dialect,
} from './json-array.js'
import type { RoleFields } from './role-fields.js'
import { sqlTrue } from './connection-reach.js'
import { reachesProject, reachesWorkspace } from './variable-reach.js'
import type { TokenCrypto } from '../crypto.js'
import type { PaginationParams, PaginatedResult } from '../pagination.js'
import { clampLimit, decodeCursor, paginateResults } from '../pagination.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTable = any

/** The tables variables are written and read with; `organization` names the org level and is absent in app-only test schemas. */
export interface EnvVarTables {
  envVars: AnyTable
  projects: AnyTable
  workspaces: AnyTable
  envVarWorkspaces: AnyTable
  envVarProjects: AnyTable
  organization?: AnyTable
}

/**
 * Variables at three levels (B4): org-wide, a project's, or a workspace's
 * (which carries its project too). Every list is one statement; the
 * resolved reads pick the closest level's value per name in SQL; a write
 * by id is pinned to the place it is addressed at, so a row of another
 * level answers like a missing one. Values are encrypted at rest.
 */
export class EnvVarsAdapter {
  private table: AnyTable

  constructor(
    private db: AnyTable,
    private t: EnvVarTables,
    private dialect: Dialect,
    private crypto?: TokenCrypto,
    private roles?: RoleFields,
  ) {
    this.table = t.envVars
  }

  /** "The person can open the project": its own aliased lookup, bound by id. */
  private projectVisibleTo(who: string, projectId: string): SQL {
    const vp = aliasedTable(this.t.projects, 'vp')
    return sql`exists (select 1 from ${aliasedFrom(vp)} where ${vp.id} = ${projectId} and ${this.roles!.projectVisible(who, { organizationId: vp.organizationId, projectId: vp.id })})`
  }

  /** "The person can open the workspace, which is the project's." */
  private workspaceVisibleTo(who: string, projectId: string, workspaceId: string): SQL {
    const vw = aliasedTable(this.t.workspaces, 'vw')
    const vp = aliasedTable(this.t.projects, 'vp')
    return sql`exists (select 1 from ${aliasedFrom(vw)} inner join ${aliasedFrom(vp)} on ${vp.id} = ${vw.projectId} where ${vw.id} = ${workspaceId} and ${vw.projectId} = ${projectId} and ${this.roles!.workspaceRoleOf(who, { organizationId: vp.organizationId, projectId: vp.id, workspaceId: vw.id })} is not null)`
  }

  /** The row's level, read off its columns. */
  private levelOf(v: AnyTable): SQL<VariableLevel> {
    return fieldOf(
      sql<VariableLevel>`case when ${v.workspaceId} is not null then 'workspace' when ${v.projectId} is not null then 'project' else 'organization' end`,
    )
  }

  /** Closest level first: a workspace row outranks its project's, which outranks the org's. */
  private rankOf(v: AnyTable): SQL<number> {
    return fieldOf(
      sql<number>`case when ${v.workspaceId} is not null then 0 when ${v.projectId} is not null then 1 else 2 end`,
    )
  }

  /** The name of the place the row is set at, from the level's own table. */
  private placeNameOf(v: AnyTable): SQL<string | null> {
    const pw = aliasedTable(this.t.workspaces, 'pw')
    const pp = aliasedTable(this.t.projects, 'pp')
    const orgName = this.t.organization
      ? (() => {
          const po = aliasedTable(this.t.organization, 'po')
          return sql`(select ${po.name} from ${aliasedFrom(po)} where ${po.id} = ${v.organizationId})`
        })()
      : sql`null`
    return fieldOf(
      sql<
        string | null
      >`case when ${v.workspaceId} is not null then (select ${pw.name} from ${aliasedFrom(pw)} where ${pw.id} = ${v.workspaceId}) when ${v.projectId} is not null then (select ${pp.name} from ${aliasedFrom(pp)} where ${pp.id} = ${v.projectId}) else ${orgName} end`,
    )
  }

  /**
   * The workspaces a project variable lists (minus those with their own row of
   * the name) and those that block it, as the JSON arrays `reachOf` reads.
   */
  private projectReachFields(v: AnyTable, visibleTo?: string): { places: SQL; blocked: SQL } {
    const w = aliasedTable(this.t.workspaces, 'rw')
    const vw = aliasedTable(this.t.envVarWorkspaces, 'rvw2')
    const own = aliasedTable(this.table, 'rown')
    const owns = sql`exists (select 1 from ${aliasedFrom(own)} where ${own.workspaceId} = ${w.id} and ${own.name} = ${v.name})`
    // Only the workspaces the viewer can open, as `overriddenIn` has it.
    const visible =
      visibleTo !== undefined && this.roles
        ? sql`${this.roles.workspaceRoleOf(visibleTo, { organizationId: v.organizationId, projectId: w.projectId, workspaceId: w.id })} is not null`
        : sql`1 = 1`
    return {
      places: fieldOf(
        sql<unknown>`(select ${jsonArrayOf(this.dialect, { id: w.id, slug: w.slug, name: w.name }, w.name)} from ${aliasedFrom(w)} where exists (select 1 from ${aliasedFrom(vw)} where ${vw.envVarId} = ${v.id} and ${vw.workspaceId} = ${w.id}) and ${visible} and not ${owns})`,
      ),
      blocked: fieldOf(
        sql<unknown>`(select ${jsonArrayOf(this.dialect, { id: w.id }, w.id)} from ${aliasedFrom(w)} where ${w.projectId} = ${v.projectId} and ${visible} and ${owns})`,
      ),
    }
  }

  /** The projects an organization variable lists (minus those with their own row of the name) and those that block it. */
  private orgReachFields(v: AnyTable, visibleTo?: string): { places: SQL; blocked: SQL } {
    const p = aliasedTable(this.t.projects, 'rp')
    const vp = aliasedTable(this.t.envVarProjects, 'rvp2')
    const own = aliasedTable(this.table, 'rown')
    const owns = sql`exists (select 1 from ${aliasedFrom(own)} where ${own.projectId} = ${p.id} and ${own.workspaceId} is null and ${own.name} = ${v.name})`
    const visible =
      visibleTo !== undefined && this.roles
        ? this.roles.projectVisible(visibleTo, {
            organizationId: p.organizationId,
            projectId: p.id,
          })
        : sql`1 = 1`
    return {
      places: fieldOf(
        sql<unknown>`(select ${jsonArrayOf(this.dialect, { id: p.id, slug: p.slug, name: p.name }, p.name)} from ${aliasedFrom(p)} where exists (select 1 from ${aliasedFrom(vp)} where ${vp.envVarId} = ${v.id} and ${vp.projectId} = ${p.id}) and ${visible} and not ${owns})`,
      ),
      blocked: fieldOf(
        sql<unknown>`(select ${jsonArrayOf(this.dialect, { id: p.id }, p.id)} from ${aliasedFrom(p)} where ${p.organizationId} = ${v.organizationId} and ${visible} and ${owns})`,
      ),
    }
  }

  private reachOf(all: unknown, places: unknown, blocked: unknown): VariableReach {
    return {
      all: Boolean(all),
      // Once it applies everywhere the list it had is moot.
      places: all ? [] : readJsonArray<VariableReachPlace>(places),
      blocked: readJsonArray<{ id: string }>(blocked).map((b) => b.id),
    }
  }

  /**
   * The conditions that pin a row to the place a write is addressed at. A
   * workspace row is matched with its project too, so a workspace and a
   * project that ever disagreed could not reach another project's rows.
   */
  private atPlace(v: AnyTable, place: VariablePlace): SQL {
    const org = eq(v.organizationId, place.organizationId)
    if (place.level === 'organization') return and(org, isNull(v.projectId))!
    if (place.level === 'project') {
      return and(org, eq(v.projectId, place.projectId), isNull(v.workspaceId))!
    }
    return and(org, eq(v.projectId, place.projectId), eq(v.workspaceId, place.workspaceId))!
  }

  private cursorOf(v: AnyTable, pagination?: PaginationParams): SQL | undefined {
    if (!pagination?.cursor) return undefined
    const { id: cursorId, timestamp } = decodeCursor(pagination.cursor)
    return or(lt(v.createdAt, timestamp), and(eq(v.createdAt, timestamp), lt(v.id, cursorId)))
  }

  /**
   * Writes a variable at one place: org-wide as is; a project's only if the
   * project is the organization's and the author can open it; a workspace's
   * only if the workspace is that project's and the author can open it —
   * each by the insert itself. Null when the check failed. A name already
   * set at the place fails the level's unique index (`isUniqueViolation`).
   */
  async create(data: {
    id: string
    place: VariablePlace
    createdBy: string
    name: string
    value: string
    isSecret: boolean
    /** False when the caller lists the places next (`addReach`); default true. */
    allPlaces?: boolean
  }): Promise<EnvVar | null> {
    const now = new Date().toISOString()
    const { place } = data
    const row: EnvVar = {
      id: data.id,
      organizationId: place.organizationId,
      projectId: place.level === 'organization' ? null : place.projectId,
      workspaceId: place.level === 'workspace' ? place.workspaceId : null,
      createdBy: data.createdBy,
      name: data.name,
      value: this.crypto ? await this.crypto.encrypt(data.value) : data.value,
      isSecret: data.isSecret,
      allPlaces: data.allPlaces ?? true,
      createdAt: now,
      updatedAt: now,
    }
    if (place.level === 'organization') {
      await this.db.insert(this.table).values(row)
      return { ...row, value: data.value }
    }
    const p = this.t.projects
    let inserted: EnvVar | null
    if (place.level === 'project') {
      inserted = await insertWhere<EnvVar>(
        this.db,
        this.table,
        row,
        p,
        and(
          eq(p.id, place.projectId),
          eq(p.organizationId, place.organizationId),
          this.roles ? this.projectVisibleTo(data.createdBy, place.projectId) : undefined,
        )!,
      )
    } else {
      const w = this.t.workspaces
      const wp = aliasedTable(p, 'wp')
      inserted = await insertWhere<EnvVar>(
        this.db,
        this.table,
        row,
        w,
        and(
          eq(w.id, place.workspaceId),
          eq(w.projectId, place.projectId),
          sql`exists (select 1 from ${aliasedFrom(wp)} where ${wp.id} = ${w.projectId} and ${wp.organizationId} = ${place.organizationId})`,
          this.roles
            ? this.workspaceVisibleTo(data.createdBy, place.projectId, place.workspaceId)
            : undefined,
        )!,
      )
    }
    return inserted ? { ...row, value: data.value } : null
  }

  /**
   * The organization's own rows, each with how many projects the viewer can
   * open set the same name themselves — in the project or one of its
   * workspaces (a workspace row carries its project).
   */
  async listByOrganization(
    organizationId: string,
    pagination?: PaginationParams,
    visibleTo?: string,
  ): Promise<PaginatedResult<OrgEnvVar>> {
    const limit = clampLimit(pagination?.limit)
    const v = aliasedTable(this.table, 'v')
    const op = aliasedTable(this.t.projects, 'op')
    const ov = aliasedTable(this.table, 'ov')
    // A project counts when the viewer can open it and the override is the
    // project's own or in a workspace they can open — what the project's
    // page would show them as chips, no more.
    const visible =
      visibleTo !== undefined && this.roles
        ? this.roles.projectVisible(visibleTo, {
            organizationId: op.organizationId,
            projectId: op.id,
          })
        : sql`1 = 1`
    const overrideVisible =
      visibleTo !== undefined && this.roles
        ? sql`(${ov.workspaceId} is null or ${this.roles.workspaceRoleOf(visibleTo, { organizationId: op.organizationId, projectId: op.id, workspaceId: ov.workspaceId })} is not null)`
        : sql`1 = 1`
    const overriddenIn = fieldOf(
      sql<number>`(select count(*) from ${aliasedFrom(op)} where ${op.organizationId} = ${v.organizationId} and ${visible} and exists (select 1 from ${aliasedFrom(ov)} where ${ov.projectId} = ${op.id} and ${ov.name} = ${v.name} and ${overrideVisible}))`,
    )
    const reach = this.orgReachFields(v, visibleTo)
    const rows: {
      row: EnvVar
      overriddenIn: number
      places: unknown
      blocked: unknown
    }[] = await this.db
      .select({
        row: v,
        overriddenIn: overriddenIn.mapWith(Number),
        places: reach.places,
        blocked: reach.blocked,
      })
      .from(v)
      .where(
        and(
          eq(v.organizationId, organizationId),
          isNull(v.projectId),
          this.cursorOf(v, pagination),
        ),
      )
      .orderBy(desc(v.createdAt), desc(v.id))
      .limit(limit + 1)
    const items = await Promise.all(
      rows.map(async ({ row, overriddenIn, places, blocked }) => ({
        ...row,
        value: await this.tryDecrypt(row.value),
        overriddenIn,
        reach: this.reachOf(row.allPlaces, places, blocked),
      })),
    )
    return paginateResults(items, limit, (r) => r.createdAt)
  }

  /** The project's own rows, not its workspaces'. */
  async listByProject(
    organizationId: string,
    projectId: string,
    pagination?: PaginationParams,
  ): Promise<PaginatedResult<EnvVar>> {
    return this.listOwn(
      and(
        eq(this.table.organizationId, organizationId),
        eq(this.table.projectId, projectId),
        isNull(this.table.workspaceId),
      )!,
      pagination,
    )
  }

  async listByWorkspace(
    organizationId: string,
    projectId: string,
    workspaceId: string,
    pagination?: PaginationParams,
  ): Promise<PaginatedResult<EnvVar>> {
    return this.listOwn(
      and(
        eq(this.table.organizationId, organizationId),
        eq(this.table.projectId, projectId),
        eq(this.table.workspaceId, workspaceId),
      )!,
      pagination,
    )
  }

  private async listOwn(
    where: SQL,
    pagination?: PaginationParams,
  ): Promise<PaginatedResult<EnvVar>> {
    const limit = clampLimit(pagination?.limit)
    const rows: EnvVar[] = await this.db
      .select()
      .from(this.table)
      .where(and(where, this.cursorOf(this.table, pagination)))
      .orderBy(desc(this.table.createdAt), desc(this.table.id))
      .limit(limit + 1)
    for (const row of rows) row.value = await this.tryDecrypt(row.value)
    return paginateResults(rows, limit, (r) => r.createdAt)
  }

  /**
   * Each name once as the project resolves it — its own value over the
   * org's — with where it is set and, for the viewer, which workspaces they
   * can open set their own value. The project's own rows first, then the
   * org's, by name.
   */
  async listResolvedForProject(
    organizationId: string,
    projectId: string,
    visibleTo?: string,
  ): Promise<ResolvedProjectVariable[]> {
    const v = aliasedTable(this.table, 'v')
    const shadow = aliasedTable(this.table, 'shadow')
    const ow = aliasedTable(this.t.workspaces, 'ow')
    const ov = aliasedTable(this.table, 'ov')
    const canOpen =
      visibleTo !== undefined && this.roles
        ? sql`${this.roles.workspaceRoleOf(visibleTo, { organizationId, projectId: ow.projectId, workspaceId: ow.id })} is not null`
        : sql`1 = 1`
    const overriddenIn = fieldOf(
      sql<unknown>`(select ${jsonArrayOf(this.dialect, { id: ow.id, slug: ow.slug, name: ow.name, colour: ow.colour }, ow.name)} from ${aliasedFrom(ow)} where ${ow.projectId} = ${projectId} and ${canOpen} and exists (select 1 from ${aliasedFrom(ov)} where ${ov.workspaceId} = ${ow.id} and ${ov.name} = ${v.name}))`,
    )
    const reach = this.projectReachFields(v, visibleTo)
    const rows: {
      row: EnvVar
      level: VariableLevel
      setAtName: string | null
      overriddenIn: unknown
      places: unknown
      blocked: unknown
    }[] = await this.db
      .select({
        row: v,
        level: this.levelOf(v),
        setAtName: this.placeNameOf(v),
        overriddenIn,
        places: reach.places,
        blocked: reach.blocked,
      })
      .from(v)
      .where(
        and(
          eq(v.organizationId, organizationId),
          isNull(v.workspaceId),
          or(
            eq(v.projectId, projectId),
            and(
              isNull(v.projectId),
              reachesProject(this.dialect, this.t, v, projectId),
              notExists(
                this.db
                  .select({ id: shadow.id })
                  .from(shadow)
                  .where(
                    and(
                      eq(shadow.projectId, projectId),
                      isNull(shadow.workspaceId),
                      eq(shadow.name, v.name),
                    ),
                  ),
              ),
            ),
          ),
        ),
      )
      .orderBy(sql`${v.projectId} is null`, asc(v.name))
    return Promise.all(
      rows.map(async ({ row, level, setAtName, overriddenIn, places, blocked }) => ({
        ...row,
        value: await this.tryDecrypt(row.value),
        level: level as 'organization' | 'project',
        setAt: {
          level: level as 'organization' | 'project',
          id: row.projectId ?? row.organizationId,
          name: setAtName,
        },
        overriddenIn: readJsonArray<WorkspaceChip>(overriddenIn),
        reach: level === 'project' ? this.reachOf(row.allPlaces, places, blocked) : null,
      })),
    )
  }

  /**
   * Each name once as the workspace resolves it — the closest level wins —
   * with where the value is set and which level it replaces. Closest level
   * first, then by name.
   */
  async listResolvedForWorkspace(
    organizationId: string,
    projectId: string,
    workspaceId: string,
  ): Promise<ResolvedWorkspaceVariable[]> {
    const v = aliasedTable(this.table, 'v')
    const level = this.levelOf(v)
    const rank = this.rankOf(v)
    const ranked = this.db
      .select({
        id: v.id,
        organizationId: v.organizationId,
        projectId: v.projectId,
        workspaceId: v.workspaceId,
        createdBy: v.createdBy,
        name: v.name,
        value: v.value,
        isSecret: v.isSecret,
        createdAt: v.createdAt,
        updatedAt: v.updatedAt,
        level: level.as('level'),
        rank: rank.as('rank'),
        sourceName: this.placeNameOf(v).as('source_name'),
        rn: fieldOf(sql<number>`row_number() over (partition by ${v.name} order by ${rank})`).as(
          'rn',
        ),
        overrides: fieldOf(
          sql<string | null>`lead(${level}) over (partition by ${v.name} order by ${rank})`,
        ).as('overrides'),
      })
      .from(v)
      .where(
        and(
          eq(v.organizationId, organizationId),
          or(
            and(eq(v.projectId, projectId), eq(v.workspaceId, workspaceId)),
            and(
              eq(v.projectId, projectId),
              isNull(v.workspaceId),
              reachesWorkspace(this.dialect, this.t, v, workspaceId),
            ),
            and(isNull(v.projectId), reachesProject(this.dialect, this.t, v, projectId)),
          ),
        ),
      )
      .as('ranked')
    const rows: (EnvVar & {
      level: VariableLevel
      rank: number
      sourceName: string | null
      rn: number
      overrides: string | null
    })[] = await this.db
      .select()
      .from(ranked)
      .where(eq(ranked.rn, 1))
      .orderBy(asc(ranked.rank), asc(ranked.name))
    return Promise.all(
      rows.map(async ({ level, rank: _rank, sourceName, rn: _rn, overrides, ...row }) => ({
        ...row,
        isSecret: Boolean(row.isSecret),
        value: await this.tryDecrypt(row.value),
        level,
        source: {
          level,
          id: row.workspaceId ?? row.projectId ?? row.organizationId,
          name: sourceName,
        },
        overrides: overrides === 'project' || overrides === 'organization' ? overrides : null,
      })),
    )
  }

  /**
   * One row per name — the closest level's, chosen in the statement — for
   * every name in `names` set at the workspace, its project or the org.
   * Without a workspace, the project (only its variables that apply to every workspace) and the org; without a project, the
   * org alone (a workspace named without its project is not a place and is
   * ignored). Resolving a `{{global.env.X}}` reference is the caller's job:
   * the form of a reference is defined in `@awaitstep/ir`.
   */
  async findByNames(
    organizationId: string,
    names: readonly string[],
    projectId?: string | null,
    workspaceId?: string | null,
  ): Promise<EnvVar[]> {
    if (names.length === 0) return []
    const v = aliasedTable(this.table, 'v')
    // A project's variable reaches the workspace only when listed (or set for every one),
    // an organization's the project likewise; without a workspace only the project's variables
    // that apply to every workspace count, since any of them may be where the caller lands.
    const ownProject = projectId
      ? and(
          eq(v.projectId, projectId),
          isNull(v.workspaceId),
          workspaceId
            ? reachesWorkspace(this.dialect, this.t, v, workspaceId)
            : sql`${v.allPlaces} = ${sqlTrue(this.dialect)}`,
        )
      : undefined
    const scope = and(
      isNull(v.projectId),
      projectId
        ? reachesProject(this.dialect, this.t, v, projectId)
        : sql`${v.allPlaces} = ${sqlTrue(this.dialect)}`,
    )
    const place =
      projectId && workspaceId
        ? or(and(eq(v.projectId, projectId), eq(v.workspaceId, workspaceId)), ownProject, scope)
        : projectId
          ? or(ownProject, scope)
          : scope
    const rank = this.rankOf(v)
    const ranked = this.db
      .select({
        id: v.id,
        organizationId: v.organizationId,
        projectId: v.projectId,
        workspaceId: v.workspaceId,
        createdBy: v.createdBy,
        name: v.name,
        value: v.value,
        isSecret: v.isSecret,
        createdAt: v.createdAt,
        updatedAt: v.updatedAt,
        rn: fieldOf(sql<number>`row_number() over (partition by ${v.name} order by ${rank})`).as(
          'rn',
        ),
      })
      .from(v)
      // One bound JSON list, not a parameter per name: a workflow's references
      // must never meet D1's cap of 100 parameters per statement.
      .where(
        and(
          eq(v.organizationId, organizationId),
          sql`${v.name} in ${idList(this.dialect, [...names])}`,
          place,
        ),
      )
      .as('ranked')
    const rows: (EnvVar & { rn: number })[] = await this.db
      .select()
      .from(ranked)
      .where(eq(ranked.rn, 1))
    return Promise.all(
      rows.map(async ({ rn: _rn, ...row }) => ({
        ...row,
        isSecret: Boolean(row.isSecret),
        value: await this.tryDecrypt(row.value),
      })),
    )
  }

  /**
   * One statement: the row is updated only where it is addressed — the
   * org-wide row of the organization, the project's own row, the
   * workspace's own row — so a row of another level answers like a missing
   * one. Null when no row matches, or when the update would make a stored
   * secret readable (isSecret flipped false with no replacement value).
   */
  async update(
    id: string,
    place: VariablePlace,
    data: { name?: string; value?: string; isSecret?: boolean; allPlaces?: true },
  ): Promise<EnvVar | null> {
    const { updates, conditions } = await this.updateParts(id, place, data)
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

  /** What an update sets and where it applies: the addressed row, and a secret never made readable by the flag alone. */
  private async updateParts(
    id: string,
    place: VariablePlace,
    data: { name?: string; value?: string; isSecret?: boolean; allPlaces?: true },
  ): Promise<{ updates: Record<string, unknown>; conditions: SQL[] }> {
    const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() }
    if (data.name !== undefined) updates.name = data.name
    if (data.value !== undefined) {
      updates.value = this.crypto ? await this.crypto.encrypt(data.value) : data.value
    }
    if (data.isSecret !== undefined) updates.isSecret = data.isSecret
    if (data.allPlaces !== undefined) updates.allPlaces = true
    const conditions = [eq(this.table.id, id), this.atPlace(this.table, place)]
    // A stored secret must not become readable by flipping the flag: without
    // a replacement value, the update applies only to rows that are already
    // non-secret. The caller tells this refusal from a miss on the error path.
    if (data.isSecret === false && data.value === undefined) {
      conditions.push(eq(this.table.isSecret, false))
    }
    return { updates, conditions }
  }

  /** The places a reach list may name (the project's workspaces, the organization's projects) and how the list picks them. */
  private reachScope(place: VariablePlace, ids: string[]) {
    const isProject = place.level === 'project'
    const places = isProject ? this.t.workspaces : this.t.projects
    const belongs = isProject
      ? eq(places.projectId, (place as { projectId: string }).projectId)
      : eq(places.organizationId, place.organizationId)
    const inList = sql`${places.id} in ${idList(this.dialect, ids)}`
    return { isProject, places, belongs, inList }
  }

  /** Every listed id is one of the variable's places: counted in the statement that writes. */
  private allListedBelong(place: VariablePlace, ids: string[]): SQL {
    const { places, belongs, inList } = this.reachScope(place, ids)
    return sql`(select count(*) from ${places} where ${belongs} and ${inList}) = ${ids.length}`
  }

  /**
   * Lists the places for the variable `id` (already written, or written by the
   * statement before it in the same batch): the listed ones that are the
   * variable's places and set no value of their own under its name.
   * A place already listed answers too (the no-op update returns its row).
   */
  private reachInsert(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the handle the statement is built on (db, or a transaction)
    db: any,
    id: string,
    place: VariablePlace,
    ids: string[],
    /** For an edit: the places are listed only if the edit's own conditions hold, so a refused edit adds none. */
    guard?: { requireNonSecret: boolean },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- a pending insert, run by a batch
  ): any {
    const { isProject, places, belongs, inList } = this.reachScope(place, ids)
    const target = isProject ? this.t.envVarWorkspaces : this.t.envVarProjects
    const own = aliasedTable(this.table, 'ownr')
    const owner = aliasedTable(this.table, 'ownv')
    const hasOwn = isProject
      ? sql`exists (select 1 from ${aliasedFrom(own)} where ${own.workspaceId} = ${places.id} and ${own.name} = ${owner.name})`
      : sql`exists (select 1 from ${aliasedFrom(own)} where ${own.projectId} = ${places.id} and ${own.workspaceId} is null and ${own.name} = ${owner.name})`
    const selected = db
      .select(
        isProject
          ? { envVarId: owner.id, workspaceId: places.id }
          : { envVarId: owner.id, projectId: places.id },
      )
      .from(owner)
      .innerJoin(places, belongs)
      .where(
        and(
          eq(owner.id, id),
          this.atPlace(owner, place),
          eq(owner.allPlaces, false),
          inList,
          sql`not ${hasOwn}`,
          guard ? this.allListedBelong(place, ids) : undefined,
          guard?.requireNonSecret ? eq(owner.isSecret, false) : undefined,
        ),
      )
    const column = isProject ? target.workspaceId : target.projectId
    return db
      .insert(target)
      .select(selected)
      .onConflictDoUpdate({
        target: [target.envVarId, column],
        set: { envVarId: sql`excluded.env_var_id` },
      })
      .returning({ placeId: column })
  }

  /**
   * Writes a project's or organization's variable that applies only to the
   * listed places (workspaces of the project, projects of the organization),
   * in one atomic batch: the row and its list are written together or not at
   * all. A place that sets its own value of the name is left out; the row is
   * not written when an id is not one of the variable's places, or when every
   * listed place sets its own value. A name already set at the level is
   * `isUniqueViolation`. The failure says why: `missing` (the place cannot be
   * written by this author), `unknown` (an id is not a place of the level),
   * `taken` (every listed place sets its own value).
   */
  async createWithReach(
    data: {
      id: string
      place: VariablePlace
      createdBy: string
      name: string
      value: string
      isSecret: boolean
    },
    placeIds: string[],
  ): Promise<{ row: EnvVar; reached: string[] } | { failure: 'missing' | 'unknown' | 'taken' }> {
    const { place } = data
    if (place.level === 'workspace') return { failure: 'missing' }
    const ids = [...new Set(placeIds)]
    const now = new Date().toISOString()
    const row: EnvVar = {
      id: data.id,
      organizationId: place.organizationId,
      projectId: place.level === 'organization' ? null : place.projectId,
      workspaceId: null,
      createdBy: data.createdBy,
      name: data.name,
      value: this.crypto ? await this.crypto.encrypt(data.value) : data.value,
      isSecret: data.isSecret,
      allPlaces: false,
      createdAt: now,
      updatedAt: now,
    }
    const { isProject, places, belongs, inList } = this.reachScope(place, ids)
    const own = aliasedTable(this.table, 'ownr')
    const hasOwn = isProject
      ? sql`exists (select 1 from ${aliasedFrom(own)} where ${own.workspaceId} = ${places.id} and ${own.name} = ${data.name})`
      : sql`exists (select 1 from ${aliasedFrom(own)} where ${own.projectId} = ${places.id} and ${own.workspaceId} is null and ${own.name} = ${data.name})`
    const someTake = sql`exists (select 1 from ${places} where ${belongs} and ${inList} and not ${hasOwn})`
    const condition = and(this.allListedBelong(place, ids), someTake)!
    const results = await atomicallyReturning<{ placeId: string }>(this.db, (tx) => {
      const insert =
        place.level === 'project'
          ? insertWhereQuery(
              tx,
              this.table,
              row,
              this.t.projects,
              and(
                eq(this.t.projects.id, place.projectId),
                eq(this.t.projects.organizationId, place.organizationId),
                this.roles ? this.projectVisibleTo(data.createdBy, place.projectId) : undefined,
                condition,
              )!,
            )
          : insertWhereQuery(
              tx,
              this.table,
              row,
              this.t.organization,
              and(eq(this.t.organization.id, place.organizationId), condition)!,
            )
      return [insert, this.reachInsert(tx, data.id, place, ids)]
    })
    const [written, reached] = results as [unknown[], { placeId: string }[]]
    if (written.length === 0) return { failure: await this.createFailure(data, place, ids) }
    return { row: { ...row, value: data.value }, reached: reached.map((r) => r.placeId).sort() }
  }

  /** Why a create with a list wrote nothing: told apart on this error path only. */
  private async createFailure(
    data: { createdBy: string },
    place: VariablePlace,
    ids: string[],
  ): Promise<'missing' | 'unknown' | 'taken'> {
    const { places, belongs, inList } = this.reachScope(place, ids)
    const counted: { n: number }[] = await this.db
      .select({ n: sql<number>`count(*)`.mapWith(Number) })
      .from(places)
      .where(and(belongs, inList))
    if ((counted[0]?.n ?? 0) < ids.length) return 'unknown'
    if (place.level === 'project') {
      const p = this.t.projects
      const open = await this.db
        .select({ id: p.id })
        .from(p)
        .where(
          and(
            eq(p.id, place.projectId),
            eq(p.organizationId, place.organizationId),
            this.roles ? this.projectVisibleTo(data.createdBy, place.projectId) : undefined,
          ),
        )
        .limit(1)
      if (open.length === 0) return 'missing'
    }
    return 'taken'
  }

  /**
   * `update`, and the listed places added to a project's or organization's
   * variable in the same atomic batch. It writes nothing when the variable
   * already applies everywhere (a list would narrow it) or when an id is not
   * one of its places; the failure says which: `missing`, `unknown`,
   * `narrowing`. Places that set their own value of the name are left out.
   */
  async updateWithReach(
    id: string,
    place: VariablePlace,
    data: { name?: string; value?: string; isSecret?: boolean },
    placeIds: string[],
  ): Promise<
    { row: EnvVar; reached: string[] } | { failure: 'missing' | 'unknown' | 'narrowing' }
  > {
    if (place.level === 'workspace') return { failure: 'missing' }
    const ids = [...new Set(placeIds)]
    const { updates, conditions } = await this.updateParts(id, place, data)
    const results = await atomicallyReturning<{ placeId: string }>(this.db, (tx) => [
      tx
        .update(this.table)
        .set(updates)
        .where(
          and(...conditions, eq(this.table.allPlaces, false), this.allListedBelong(place, ids)),
        )
        .returning(),
      this.reachInsert(tx, id, place, ids, {
        requireNonSecret: data.isSecret === false && data.value === undefined,
      }),
    ])
    const [written, reached] = results as [EnvVar[], { placeId: string }[]]
    const row = written[0]
    if (!row) return { failure: await this.updateFailure(id, place, ids) }
    row.value = await this.tryDecrypt(row.value)
    return { row, reached: reached.map((r) => r.placeId).sort() }
  }

  private async updateFailure(
    id: string,
    place: VariablePlace,
    ids: string[],
  ): Promise<'missing' | 'unknown' | 'narrowing'> {
    const { places, belongs, inList } = this.reachScope(place, ids)
    const counted: { n: number }[] = await this.db
      .select({ n: sql<number>`count(*)`.mapWith(Number) })
      .from(places)
      .where(and(belongs, inList))
    const rows: { allPlaces: boolean }[] = await this.db
      .select({ allPlaces: this.table.allPlaces })
      .from(this.table)
      .where(and(eq(this.table.id, id), this.atPlace(this.table, place)))
      .limit(1)
    if (rows.length === 0) return 'missing'
    if ((counted[0]?.n ?? 0) < ids.length) return 'unknown'
    return rows[0]!.allPlaces ? 'narrowing' : 'missing'
  }
  /**
   * Whether the row at the addressed place is a secret: the error path's
   * one statement, telling the un-hide refusal from a plain miss without
   * reading the value.
   */
  async isSecretAt(id: string, place: VariablePlace): Promise<boolean> {
    const rows = await this.db
      .select({ id: this.table.id })
      .from(this.table)
      .where(
        and(eq(this.table.id, id), this.atPlace(this.table, place), eq(this.table.isSecret, true)),
      )
      .limit(1)
    return rows.length > 0
  }

  /** Deletes the row where it is addressed; its name, or null when no row matched there. */
  async delete(id: string, place: VariablePlace): Promise<string | null> {
    const rows = await this.db
      .delete(this.table)
      .where(and(eq(this.table.id, id), this.atPlace(this.table, place)))
      .returning({ name: this.table.name })
    return rows[0]?.name ?? null
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
