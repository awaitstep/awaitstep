import { aliasedTable, and, asc, desc, eq, lt, ne, or, sql, type SQL } from 'drizzle-orm'
import type {
  Connection,
  ConnectionCoverage,
  ConnectionListOptions,
  ConnectionListRow,
  ConnectionTokenCheck,
  ConnectionUpdate,
  ConnectionWrite,
  ExpiringConnectionsCheck,
  ProjectSetupCounts,
} from '../types.js'
import type { TokenCrypto } from '../crypto.js'
import type { PaginatedResult } from '../pagination.js'
import { clampLimit, decodeCursor, paginateResults } from '../pagination.js'
import { atomicallyReturning } from './atomic.js'
import { boundFields } from './insert-where.js'
import {
  aliasedFrom,
  fieldOf,
  idList,
  jsonArrayOf,
  readJsonArray,
  type Dialect,
} from './json-array.js'
import type { RoleFields } from './role-fields.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTable = any

export interface ConnectionTables {
  connections: AnyTable
  connectionProjects: AnyTable
  projects: AnyTable
  deployments: AnyTable
  member: AnyTable
  user: AnyTable
  notifications: AnyTable
  envVars: AnyTable
  apiKeys: AnyTable
}

const ORG_ADMINS = sql.raw(`('owner', 'admin')`)

/** A driver's boolean: pg's own, sqlite's 0/1. */
function truthy(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || value === 't'
}

type ListedRow = Omit<ConnectionListRow, 'projects' | 'allProjects' | 'deployments'> & {
  allProjects: unknown
  projects: unknown
  deploymentCount: number | string
  lastDeployAt: string | null
}

/**
 * Cloudflare connections: the account's credentials (encrypted at rest),
 * which projects it serves, and its token's health as the provider last
 * reported it. Coverage and every check on it are decided in SQL.
 */
export class ConnectionsAdapter {
  constructor(
    private db: AnyTable,
    private t: ConnectionTables,
    private dialect: Dialect,
    private crypto?: TokenCrypto,
    private roles?: RoleFields,
  ) {}

  private get table() {
    return this.t.connections
  }

  private async encrypt(value: string): Promise<string> {
    return this.crypto ? this.crypto.encrypt(value) : value
  }

  private async tryDecrypt(value: string): Promise<string> {
    if (!this.crypto) return value
    try {
      return await this.crypto.decrypt(value)
    } catch {
      return value
    }
  }

  /**
   * True when every id names a project of the organization — the guard each
   * write repeats, so a foreign id leaves nothing written. An empty list is
   * always fine.
   */
  private projectsBelong(organizationId: string, projectIds: string[]): SQL {
    if (projectIds.length === 0) return sql`1 = 1`
    const p = aliasedTable(this.t.projects, 'cpb')
    return sql`(select count(*) from ${aliasedFrom(p)} where ${p.organizationId} = ${organizationId} and ${p.id} in ${idList(this.dialect, projectIds)}) = ${projectIds.length}`
  }

  /**
   * The organization's projects among `projectIds`, as rows of
   * `connection_projects` — written only while the connection is the
   * organization's and every id is, the guards the unit's other statements
   * carry, so a refused write adds nothing here either.
   */
  private coverageRows(tx: AnyTable, connectionId: string, organizationId: string, ids: string[]) {
    const cp = this.t.connectionProjects
    const p = aliasedTable(this.t.projects, 'cpi')
    const c = aliasedTable(this.table, 'cpc')
    return tx
      .insert(cp)
      .select(
        tx
          .select({ connectionId: sql`${connectionId}`.as('connection_id'), projectId: p.id })
          .from(p)
          .where(
            and(
              eq(p.organizationId, organizationId),
              sql`${p.id} in ${idList(this.dialect, ids)}`,
              sql`exists (select 1 from ${aliasedFrom(c)} where ${c.id} = ${connectionId} and ${c.organizationId} = ${organizationId})`,
              this.projectsBelong(organizationId, ids),
            ),
          ),
      )
      .onConflictDoNothing()
  }

  /**
   * Writes the connection and the projects it serves as one unit, and reads
   * it back as the list shows it in the same batch. Null when a project id
   * isn't the organization's: then nothing is written.
   */
  async create(
    data: ConnectionWrite & { id: string; createdBy: string },
  ): Promise<ConnectionListRow | null> {
    const now = new Date().toISOString()
    const allProjects = data.allProjects ?? true
    const projectIds = allProjects ? [] : [...new Set(data.projectIds ?? [])]
    const row = {
      id: data.id,
      organizationId: data.organizationId,
      createdBy: data.createdBy,
      provider: data.provider,
      name: data.name,
      credentials: await this.encrypt(data.credentials),
      allProjects,
      tokenStatus: data.token?.status ?? 'unchecked',
      tokenExpiresAt: data.token?.expiresAt ?? null,
      tokenCheckedAt: data.token?.checkedAt ?? null,
      createdAt: now,
      updatedAt: now,
    }
    const results = await atomicallyReturning<unknown>(this.db, (tx) => [
      tx
        .insert(this.table)
        .select(
          tx
            .select(boundFields(this.table, row))
            .from(sql`(select 1) as one`)
            .where(this.projectsBelong(data.organizationId, projectIds)),
        )
        .returning({ id: this.table.id }),
      ...(projectIds.length > 0
        ? [
            this.coverageRows(tx, data.id, data.organizationId, projectIds).returning({
              id: this.t.connectionProjects.connectionId,
            }),
          ]
        : []),
      this.listQuery(tx, data.organizationId, { id: data.id, visibleTo: data.visibleTo }),
    ])
    if ((results[0] ?? []).length === 0) return null
    const [listed] = await this.shape(results[results.length - 1] as ListedRow[])
    return listed ?? null
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
    if (row) row.credentials = await this.tryDecrypt(row.credentials)
    return row
  }

  /** Whether the connection serves the project: every one, or it is listed. */
  private covers(connectionId: SQL | unknown, projectId: SQL | unknown): SQL {
    const cp = aliasedTable(this.t.connectionProjects, 'ccv')
    return sql`(${this.table.allProjects} = ${this.dialect === 'pg' ? sql`true` : sql`1`} or exists (select 1 from ${aliasedFrom(cp)} where ${cp.connectionId} = ${connectionId} and ${cp.projectId} = ${projectId}))`
  }

  /**
   * The organization's connection with whether it serves the project — one
   * statement, so a deploy reads the credentials and the coverage together.
   */
  async getForProject(
    id: string,
    organizationId: string,
    projectId: string,
  ): Promise<ConnectionCoverage | null> {
    const rows = await this.db
      .select({
        connection: this.table,
        covered: fieldOf(sql<unknown>`${this.covers(this.table.id, projectId)}`),
      })
      .from(this.table)
      .where(and(eq(this.table.id, id), eq(this.table.organizationId, organizationId)))
      .limit(1)
    const row = rows[0] as { connection: Connection; covered: unknown } | undefined
    if (!row) return null
    const connection = { ...row.connection }
    connection.credentials = await this.tryDecrypt(connection.credentials)
    return { connection, covered: truthy(row.covered) }
  }

  /**
   * The organization's connection, only if the workflow has a successful
   * deployment made with it — one statement. What a trigger may start: the
   * workflow it deployed there, never a same-named one in another project's
   * account (security review M1).
   */
  async getDeployedWith(
    id: string,
    organizationId: string,
    workflowId: string,
  ): Promise<Connection | null> {
    const d = aliasedTable(this.t.deployments, 'cdw')
    const rows = await this.db
      .select()
      .from(this.table)
      .where(
        and(
          eq(this.table.id, id),
          eq(this.table.organizationId, organizationId),
          sql`exists (select 1 from ${aliasedFrom(d)} where ${d.connectionId} = ${this.table.id} and ${d.workflowId} = ${workflowId} and ${d.status} = 'success')`,
        ),
      )
      .limit(1)
    const row = (rows[0] as Connection | undefined) ?? null
    if (row) row.credentials = await this.tryDecrypt(row.credentials)
    return row
  }

  /**
   * The organization's connections, newest first, each with who added it,
   * the projects it serves that the reader may see (the rest counted), and
   * its successful deployments — one statement. `projectId` keeps only the
   * connections serving that project.
   */
  async list(
    organizationId: string,
    options: ConnectionListOptions = {},
  ): Promise<PaginatedResult<ConnectionListRow>> {
    const limit = clampLimit(options.limit)
    const rows = (await this.listQuery(this.db, organizationId, options, limit + 1)) as ListedRow[]
    return paginateResults(await this.shape(rows), limit, (r) => r.createdAt)
  }

  /** The list's statement, built on `tx` and not run: a write reads its row back with it. */
  private listQuery(
    tx: AnyTable,
    organizationId: string,
    options: ConnectionListOptions,
    limit?: number,
  ) {
    const c = this.table
    const cp = aliasedTable(this.t.connectionProjects, 'clp')
    const p = aliasedTable(this.t.projects, 'clpp')
    const d = aliasedTable(this.t.deployments, 'cld')
    const u = aliasedTable(this.t.user, 'clu')
    const visible = this.projectVisibleTo(options.visibleTo, p.id)
    const conditions: (SQL | undefined)[] = [eq(c.organizationId, organizationId)]
    if (options.id) conditions.push(eq(c.id, options.id))
    if (options.project) {
      const op = aliasedTable(this.t.projects, 'clop')
      // Only a project the reader can see: a hidden one matches nothing, as a
      // wrong slug does, so the filter never says it exists (security review L2).
      const named =
        'id' in options.project
          ? sql`${op.id} = ${options.project.id}`
          : sql`${op.slug} = ${options.project.slug}`
      const projectId = sql`(select ${op.id} from ${aliasedFrom(op)} where ${op.organizationId} = ${organizationId} and ${named} and ${this.projectVisibleTo(options.visibleTo, op.id)})`
      // A project not found (another organization's, a wrong slug) matches nothing.
      conditions.push(sql`${projectId} is not null`, this.covers(c.id, projectId))
    }
    if (options.cursor) {
      const { id: cursorId, timestamp } = decodeCursor(options.cursor)
      conditions.push(
        or(lt(c.createdAt, timestamp), and(eq(c.createdAt, timestamp), lt(c.id, cursorId))),
      )
    }
    const served = sql`from ${aliasedFrom(cp)} inner join ${aliasedFrom(p)} on ${p.id} = ${cp.projectId} where ${cp.connectionId} = ${c.id}`
    const query = tx
      .select({
        id: c.id,
        organizationId: c.organizationId,
        createdBy: c.createdBy,
        provider: c.provider,
        name: c.name,
        credentials: c.credentials,
        allProjects: c.allProjects,
        tokenStatus: c.tokenStatus,
        tokenExpiresAt: c.tokenExpiresAt,
        tokenCheckedAt: c.tokenCheckedAt,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        createdByName: fieldOf(
          sql<
            string | null
          >`(select ${u.name} from ${aliasedFrom(u)} where ${u.id} = ${c.createdBy})`,
        ),
        projects: fieldOf(
          sql`(select ${jsonArrayOf(this.dialect, { id: p.id, name: p.name, slug: p.slug }, sql`${p.name}`)} ${served} and ${visible})`,
        ),
        hiddenProjects: fieldOf(
          sql<number>`(select count(*) ${served} and not ${visible})`.mapWith(Number),
        ),
        deploymentCount: fieldOf(
          sql<number>`(select count(*) from ${aliasedFrom(d)} where ${d.connectionId} = ${c.id} and ${d.status} = 'success')`.mapWith(
            Number,
          ),
        ),
        lastDeployAt: fieldOf(
          sql<
            string | null
          >`(select max(${d.createdAt}) from ${aliasedFrom(d)} where ${d.connectionId} = ${c.id} and ${d.status} = 'success')`,
        ),
      })
      .from(c)
      .where(and(...conditions))
      .orderBy(desc(c.createdAt), desc(c.id))
    return limit === undefined ? query : query.limit(limit)
  }

  /** Rows as the driver returned them → the list's shape, credentials decrypted. */
  private async shape(rows: ListedRow[]): Promise<ConnectionListRow[]> {
    const shaped: ConnectionListRow[] = []
    for (const row of rows) {
      const { deploymentCount, lastDeployAt, ...rest } = row
      shaped.push({
        ...rest,
        credentials: await this.tryDecrypt(row.credentials),
        allProjects: truthy(row.allProjects),
        projects: readJsonArray<{ id: string; name: string; slug: string }>(row.projects),
        hiddenProjects: Number(row.hiddenProjects),
        // pg's driver hands the token timestamps back as ISO through the column's own mapping.
        deployments: { count: Number(deploymentCount), lastAt: toIso(lastDeployAt) },
      })
    }
    return shaped
  }

  /** Whether the reader may see a project: a person by their roles, a key by its level. */
  private projectVisibleTo(
    visibleTo: ConnectionListOptions['visibleTo'],
    projectId: SQL | unknown,
  ): SQL {
    if (!visibleTo || visibleTo === 'all') return sql`1 = 1`
    if ('projectId' in visibleTo) return sql`${projectId} = ${visibleTo.projectId}`
    if (!this.roles) return sql`1 = 1`
    const p = aliasedTable(this.t.projects, 'clv')
    return sql`exists (select 1 from ${aliasedFrom(p)} where ${p.id} = ${projectId} and ${this.roles.projectVisible(visibleTo.userId, { organizationId: p.organizationId, projectId: p.id })})`
  }

  /**
   * Changes what is given; a new project list replaces the old as one unit,
   * and the row is read back as the list shows it in the same batch. Null
   * when nothing was written: the row isn't there (or isn't the
   * organization's), or a project id isn't the organization's.
   */
  async update(id: string, data: ConnectionUpdate): Promise<ConnectionListRow | null> {
    const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() }
    if (data.name !== undefined) updates.name = data.name
    if (data.credentials !== undefined) updates.credentials = await this.encrypt(data.credentials)
    if (data.token) {
      updates.tokenStatus = data.token.status
      updates.tokenExpiresAt = data.token.expiresAt
      updates.tokenCheckedAt = data.token.checkedAt
    }
    const coverageChanges = data.allProjects !== undefined || data.projectIds !== undefined
    const allProjects = data.allProjects ?? (data.projectIds === undefined ? undefined : false)
    if (allProjects !== undefined) updates.allProjects = allProjects
    const projectIds = allProjects === false ? [...new Set(data.projectIds ?? [])] : []
    const { organizationId } = data
    const belongs = this.projectsBelong(organizationId, projectIds)
    const scope = and(eq(this.table.id, id), eq(this.table.organizationId, organizationId))
    const cp = this.t.connectionProjects
    const results = await atomicallyReturning<unknown>(this.db, (tx) => {
      const statements = [
        tx
          .update(this.table)
          .set(updates)
          .where(and(scope, belongs))
          .returning({ id: this.table.id }),
      ]
      if (coverageChanges) {
        statements.push(
          tx
            .delete(cp)
            .where(
              and(
                eq(cp.connectionId, id),
                belongs,
                sql`exists (select 1 from ${this.table} where ${scope})`,
              ),
            )
            .returning({ id: cp.connectionId }),
        )
        if (projectIds.length > 0) {
          statements.push(
            this.coverageRows(tx, id, organizationId, projectIds).returning({
              id: cp.connectionId,
            }),
          )
        }
      }
      statements.push(this.listQuery(tx, organizationId, { id, visibleTo: data.visibleTo }))
      return statements
    })
    if ((results[0] ?? []).length === 0) return null
    const [listed] = await this.shape(results[results.length - 1] as ListedRow[])
    return listed ?? null
  }

  /**
   * What the project has set up, for its empty pages — one statement: a
   * Cloudflare account serving it whose token works and hasn't expired, the
   * org variables it inherits (those it doesn't set itself), its own
   * variables and its live keys. Null when the project isn't the organization's.
   */
  async projectSetup(
    organizationId: string,
    projectId: string,
    now: string,
  ): Promise<ProjectSetupCounts | null> {
    const p = this.t.projects
    const c = aliasedTable(this.table, 'psc')
    const cp = aliasedTable(this.t.connectionProjects, 'pscp')
    const ov = aliasedTable(this.t.envVars, 'psov')
    const pv = aliasedTable(this.t.envVars, 'pspv')
    const k = aliasedTable(this.t.apiKeys, 'psk')
    const yes = this.dialect === 'pg' ? sql`true` : sql`1`
    const projectVar = (v: AnyTable) => sql`${v.projectId} = ${p.id} and ${v.workspaceId} is null`
    const rows = (await this.db
      .select({
        cloudflareConnected: fieldOf(
          sql<unknown>`exists (select 1 from ${aliasedFrom(c)} where ${c.organizationId} = ${p.organizationId} and ${c.provider} = 'cloudflare' and (${c.allProjects} = ${yes} or exists (select 1 from ${aliasedFrom(cp)} where ${cp.connectionId} = ${c.id} and ${cp.projectId} = ${p.id})) and ${c.tokenStatus} <> 'invalid' and (${c.tokenExpiresAt} is null or ${c.tokenExpiresAt} > ${now}))`,
        ),
        orgVariables: fieldOf(
          sql<number>`(select count(*) from ${aliasedFrom(ov)} where ${ov.organizationId} = ${p.organizationId} and ${ov.projectId} is null and ${ov.workspaceId} is null and not exists (select 1 from ${aliasedFrom(pv)} where ${projectVar(pv)} and ${pv.name} = ${ov.name}))`.mapWith(
            Number,
          ),
        ),
        projectVariables: fieldOf(
          sql<number>`(select count(*) from ${aliasedFrom(pv)} where ${projectVar(pv)})`.mapWith(
            Number,
          ),
        ),
        projectKeys: fieldOf(
          sql<number>`(select count(*) from ${aliasedFrom(k)} where ${k.projectId} = ${p.id} and ${k.workspaceId} is null and ${k.revokedAt} is null and (${k.expiresAt} is null or ${k.expiresAt} > ${now}))`.mapWith(
            Number,
          ),
        ),
      })
      .from(p)
      .where(and(eq(p.id, projectId), eq(p.organizationId, organizationId)))
      .limit(1)) as (Omit<ProjectSetupCounts, 'cloudflareConnected'> & {
      cloudflareConnected: unknown
    })[]
    const row = rows[0]
    if (!row) return null
    return {
      cloudflareConnected: truthy(row.cloudflareConnected),
      orgVariables: Number(row.orgVariables),
      projectVariables: Number(row.projectVariables),
      projectKeys: Number(row.projectKeys),
    }
  }

  /** Whether a row went: false when it was already gone. */
  async delete(id: string): Promise<boolean> {
    const rows = await this.db
      .delete(this.table)
      .where(eq(this.table.id, id))
      .returning({ id: this.table.id })
    return rows.length > 0
  }

  /**
   * Connections of the provider whose token was never checked or was last
   * checked before `before`, at most `limit`: each organization's oldest
   * first, the organizations taking turns.
   */
  async dueForCheck(provider: string, before: string, limit: number): Promise<Connection[]> {
    const c = this.table
    const rows = (await this.db
      .select()
      .from(c)
      .where(
        and(
          eq(c.provider, provider),
          or(sql`${c.tokenCheckedAt} is null`, lt(c.tokenCheckedAt, before)),
        ),
      )
      // Never-checked first, then oldest — taken in turns across organizations, so
      // one with thousands of connections can't hold back every other's (review L5).
      .orderBy(
        sql`row_number() over (partition by ${c.organizationId} order by ${c.tokenCheckedAt} is not null, ${c.tokenCheckedAt}, ${c.id})`,
        sql`${c.tokenCheckedAt} is not null`,
        asc(c.tokenCheckedAt),
        asc(c.id),
      )
      .limit(limit)) as Connection[]
    for (const row of rows) row.credentials = await this.tryDecrypt(row.credentials)
    return rows
  }

  /**
   * Stores a check made on the row as it was read (`readCheckedAt`): a
   * token replaced since then was checked by its own write, and wins. Null
   * when nothing was written; else the organization, so a newly dead token
   * can be told about.
   */
  async recordTokenCheck(
    id: string,
    readCheckedAt: string | null,
    check: ConnectionTokenCheck,
  ): Promise<{ organizationId: string } | null> {
    const c = this.table
    const same =
      readCheckedAt === null
        ? sql`${c.tokenCheckedAt} is null`
        : this.dialect === 'pg'
          ? // Read back at millisecond precision: a value written elsewhere with
            // microseconds must still match what was read (Docker e2e).
            sql`date_trunc('milliseconds', ${c.tokenCheckedAt}) = ${readCheckedAt}::timestamp`
          : eq(c.tokenCheckedAt, readCheckedAt)
    const rows = await this.db
      .update(c)
      .set({
        tokenStatus: check.status,
        tokenExpiresAt: check.expiresAt,
        tokenCheckedAt: check.checkedAt,
      })
      .where(and(eq(c.id, id), same))
      .returning({ organizationId: c.organizationId })
    return (rows[0] as { organizationId: string } | undefined) ?? null
  }

  /**
   * Warns the people who can replace a token before it expires — once inside
   * `warnBefore`, once more inside `lastWarnBefore` — in one statement: the
   * connection's creator and the organization's owners and admins, each
   * once. A new expiry (a replaced token) warns afresh. How many rows it wrote.
   */
  async notifyExpiring(check: ExpiringConnectionsCheck): Promise<number> {
    const n = this.t.notifications
    const c = aliasedTable(this.table, 'nec')
    const m = aliasedTable(this.t.member, 'nem')
    const expiresText =
      this.dialect === 'pg'
        ? sql`to_char(${c.tokenExpiresAt}, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`
        : sql`${c.tokenExpiresAt}`
    const threshold = sql`(case when ${c.tokenExpiresAt} <= ${check.lastWarnBefore} then '1d' else '7d' end)`
    const meta =
      this.dialect === 'pg'
        ? sql`json_build_object('connection', ${c.name}, 'expiresAt', ${expiresText})::text`
        : sql`json_object('connection', ${c.name}, 'expiresAt', ${expiresText})`
    const row = {
      id: '',
      organizationId: '',
      userId: '',
      kind: check.kind,
      event: check.event,
      groupKey: '',
      projectId: null,
      workspaceId: null,
      accessRequestId: null,
      meta: '{}',
      count: 1,
      needsAction: check.needsAction,
      readAt: null,
      createdAt: check.now,
      updatedAt: check.now,
    }
    const select = this.db
      .select({
        ...boundFields(n, row),
        // The expiry is in the id as in the group key: a replaced token's warnings are new rows.
        id: sql<string>`${check.idPrefix} || '_' || ${c.id} || '_' || ${m.userId} || '_' || ${expiresText} || '_' || ${threshold}`,
        organizationId: c.organizationId,
        userId: m.userId,
        groupKey: sql<string>`${check.event} || ':' || ${c.id} || ':' || ${expiresText} || ':' || ${threshold}`,
        meta: sql<string>`${meta}`,
      })
      .from(c)
      .innerJoin(
        m,
        and(
          eq(m.organizationId, c.organizationId),
          or(eq(m.userId, c.createdBy), sql`${m.role} in ${ORG_ADMINS}`),
        ),
      )
      .where(
        and(
          ne(c.tokenStatus, 'invalid'),
          sql`${c.tokenExpiresAt} > ${check.now}`,
          sql`${c.tokenExpiresAt} <= ${check.warnBefore}`,
        ),
      )
    const rows = await this.db
      .insert(n)
      .select(select)
      .onConflictDoNothing({ target: [n.userId, n.groupKey] })
      .returning({ id: n.id })
    return rows.length
  }
}

/** pg hands timestamps back as `YYYY-MM-DD HH:MM:SS…` from a raw aggregate. */
function toIso(value: string | null): string | null {
  if (!value) return null
  if (value.includes('T')) return value
  const time = Date.parse(`${value.replace(' ', 'T')}Z`)
  return Number.isNaN(time) ? value : new Date(time).toISOString()
}
