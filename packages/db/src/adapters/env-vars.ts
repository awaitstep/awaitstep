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
  WorkspaceChip,
} from '../types.js'
import { insertWhere } from './insert-where.js'
import {
  aliasedFrom,
  fieldOf,
  idList,
  jsonArrayOf,
  readJsonArray,
  type Dialect,
} from './json-array.js'
import type { RoleFields } from './role-fields.js'
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
    const rows: { row: EnvVar; overriddenIn: number }[] = await this.db
      .select({ row: v, overriddenIn: overriddenIn.mapWith(Number) })
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
      rows.map(async ({ row, overriddenIn }) => ({
        ...row,
        value: await this.tryDecrypt(row.value),
        overriddenIn,
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
    const rows: {
      row: EnvVar
      level: VariableLevel
      setAtName: string | null
      overriddenIn: unknown
    }[] = await this.db
      .select({ row: v, level: this.levelOf(v), setAtName: this.placeNameOf(v), overriddenIn })
      .from(v)
      .where(
        and(
          eq(v.organizationId, organizationId),
          isNull(v.workspaceId),
          or(
            eq(v.projectId, projectId),
            and(
              isNull(v.projectId),
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
      rows.map(async ({ row, level, setAtName, overriddenIn }) => ({
        ...row,
        value: await this.tryDecrypt(row.value),
        level: level as 'organization' | 'project',
        setAt: {
          level: level as 'organization' | 'project',
          id: row.projectId ?? row.organizationId,
          name: setAtName,
        },
        overriddenIn: readJsonArray<WorkspaceChip>(overriddenIn),
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
            and(eq(v.projectId, projectId), isNull(v.workspaceId)),
            isNull(v.projectId),
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
   * Without a workspace, the project and the org; without a project, the
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
    const ownProject = projectId
      ? and(eq(v.projectId, projectId), isNull(v.workspaceId))
      : undefined
    const scope = isNull(v.projectId)
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
    data: { name?: string; value?: string; isSecret?: boolean },
  ): Promise<EnvVar | null> {
    const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() }
    if (data.name !== undefined) updates.name = data.name
    if (data.value !== undefined) {
      updates.value = this.crypto ? await this.crypto.encrypt(data.value) : data.value
    }
    if (data.isSecret !== undefined) updates.isSecret = data.isSecret

    const conditions = [eq(this.table.id, id), this.atPlace(this.table, place)]
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
