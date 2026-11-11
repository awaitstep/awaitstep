import {
  aliasedTable,
  and,
  asc,
  desc,
  eq,
  getTableColumns,
  lt,
  ne,
  or,
  sql,
  type SQL,
} from 'drizzle-orm'
import type {
  Connection,
  ConnectionCoverage,
  ConnectionListOptions,
  ConnectionListRow,
  ConnectionRefresh,
  ConnectionTokenCheck,
  ConnectionUpdate,
  ConnectionWrite,
  DeployConfigLookup,
  DeployedConnection,
  LiveService,
  RunControlTarget,
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
  isoText,
  jsonArrayOf,
  readJsonArray,
  type Dialect,
} from './json-array.js'
import type { RoleFields } from './role-fields.js'
import { reachesProject } from './variable-reach.js'
import { isProjectsAccount, servesProject } from './connection-reach.js'
import { latestDeployedName } from './deployment-snapshot.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTable = any

export interface ConnectionTables {
  connections: AnyTable
  connectionProjects: AnyTable
  projectConnections: AnyTable
  projects: AnyTable
  deployments: AnyTable
  deploymentConfigs: AnyTable
  workflowRuns: AnyTable
  member: AnyTable
  user: AnyTable
  notifications: AnyTable
  envVars: AnyTable
  envVarProjects: AnyTable
  apiKeys: AnyTable
  apiKeyProjects: AnyTable
}

const ORG_ADMINS = sql.raw(`('owner', 'admin')`)

/** A driver's boolean: pg's own, sqlite's 0/1. */
function truthy(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || value === 't'
}

/**
 * The account `id` names, else the one the workflow's newest successful deploy
 * went out on — as a value to compare a connection id with.
 */
function accountOf(deployments: AnyTable, id: string | null, workflowId: string): SQL {
  if (id !== null) return sql`${id}`
  const n = aliasedTable(deployments, 'cna')
  return sql`(select ${n.connectionId} from ${aliasedFrom(n)} where ${n.workflowId} = ${workflowId} and ${n.status} = 'success' and ${n.connectionId} is not null order by ${n.createdAt} desc, ${n.id} desc limit 1)`
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
    private refresh?: ConnectionRefresh,
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
   * A connection the app's refresher has renewed, persisted. Reading a
   * connection is where a short-lived credential is made fresh: every caller
   * — deploy, run sync, run controls, the token check — goes through here.
   * A refresh that throws or has nothing to do leaves the row as it was.
   */
  private async withFresh<T extends Connection>(connection: T): Promise<T> {
    if (!this.refresh) return connection
    const next = await this.refresh(connection).catch(() => null)
    if (!next) return connection
    const token = next.token
    const fresh = {
      ...connection,
      credentials: next.credentials,
      ...(token && {
        tokenStatus: token.status,
        tokenExpiresAt: token.expiresAt,
        tokenCheckedAt: token.checkedAt,
      }),
    }
    // A failed write (a delete raced it) does not change what this read uses.
    const persisted = await this.update(connection.id, {
      organizationId: connection.organizationId,
      credentials: next.credentials,
      ...(token && { token }),
      expectedUpdatedAt: connection.updatedAt,
    }).catch(() => null)
    // A reconnect or replacement landed first; its credentials are the ones
    // that count, not the ones this refresh just minted.
    return persisted ? fresh : connection
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
    if (!row) return null
    row.credentials = await this.tryDecrypt(row.credentials)
    return this.withFresh(row)
  }

  /**
   * The organization's connection with whether it is one of the project's
   * accounts (added or owned, and still serving it) — one statement, so a
   * deploy reads the credentials and the check together.
   */
  async getForProject(
    id: string,
    organizationId: string,
    projectId: string,
  ): Promise<ConnectionCoverage | null> {
    const rows = await this.db
      .select({
        connection: this.table,
        covered: fieldOf(
          sql<unknown>`${isProjectsAccount(this.dialect, this.t, this.table, projectId)}`,
        ),
      })
      .from(this.table)
      .where(and(eq(this.table.id, id), eq(this.table.organizationId, organizationId)))
      .limit(1)
    const row = rows[0] as { connection: Connection; covered: unknown } | undefined
    if (!row) return null
    const connection = { ...row.connection }
    connection.credentials = await this.tryDecrypt(connection.credentials)
    return { connection: await this.withFresh(connection), covered: truthy(row.covered) }
  }

  /**
   * What Deploy's settings read for one account — its provider, whether it
   * serves the project, and the workflow's stored config on it — one statement,
   * without reading the credentials.
   */
  async getDeployConfigFor(
    id: string,
    organizationId: string,
    projectId: string,
    workflowId: string,
  ): Promise<DeployConfigLookup | null> {
    const dc = aliasedTable(this.t.deploymentConfigs, 'cdc')
    const rows = await this.db
      .select({
        provider: this.table.provider,
        covered: fieldOf(
          sql<unknown>`${isProjectsAccount(this.dialect, this.t, this.table, projectId)}`,
        ),
        // Matched by the bound id: an outer column in a select list renders unqualified.
        config: sql<
          string | null
        >`(select ${dc.config} from ${aliasedFrom(dc)} where ${dc.workflowId} = ${workflowId} and ${dc.connectionId} = ${id} limit 1)`,
      })
      .from(this.table)
      .where(and(eq(this.table.id, id), eq(this.table.organizationId, organizationId)))
      .limit(1)
    const row = rows[0] as { provider: string; covered: unknown; config: string | null } | undefined
    if (!row) return null
    return { provider: row.provider, covered: truthy(row.covered), config: row.config ?? null }
  }

  /** The project's own account (never a shared one), credentials decrypted. */
  async getOwnedByProject(id: string, projectId: string): Promise<Connection | null> {
    const rows = await this.db
      .select()
      .from(this.table)
      .where(and(eq(this.table.id, id), eq(this.table.projectId, projectId)))
      .limit(1)
    const row = (rows[0] as Connection | undefined) ?? null
    if (!row) return null
    row.credentials = await this.tryDecrypt(row.credentials)
    return this.withFresh(row)
  }

  /**
   * The organization's connection, only if the workflow has a successful
   * deployment made with it — one statement. What a trigger may start: the
   * workflow it deployed there, never a same-named one in another project's
   * account (security review M1). A null `id` is the account its newest
   * successful deploy went out on.
   */
  async getDeployedWith(
    id: string | null,
    organizationId: string,
    workflowId: string,
  ): Promise<DeployedConnection | null> {
    const d = aliasedTable(this.t.deployments, 'cdw')
    const live = aliasedTable(this.t.deployments, 'cdv')
    const dc = aliasedTable(this.t.deploymentConfigs, 'cdwc')
    const account = accountOf(this.t.deployments, id, workflowId)
    const newestDeploy = (column: SQL | AnyTable) =>
      sql`select ${column} from ${aliasedFrom(live)} where ${live.connectionId} = ${account} and ${live.workflowId} = ${workflowId} and ${live.status} = 'success' order by ${live.createdAt} desc, ${live.id} desc limit 1`
    const rows = await this.db
      .select({
        ...getTableColumns(this.table),
        // The newest successful deploy on this account is what Cloudflare runs. Columns in a
        // select list go unqualified, so the connection is matched by `id`, not its column.
        deployedVersionId: sql<string | null>`(${newestDeploy(live.versionId)})`,
        // Its number outlives the version row.
        deployedVersionNumber: sql<number | null>`(${newestDeploy(live.versionNumber)})`,
        // What the provider calls it there: a trigger starts its runs under that name.
        deployedName: sql<string | null>`(${newestDeploy(live.deployedName)})`,
        // The workflow's stored deploy settings there (retention for the runs it starts).
        deploymentConfig: sql<
          string | null
        >`(select ${dc.config} from ${aliasedFrom(dc)} where ${dc.workflowId} = ${workflowId} and ${dc.connectionId} = ${account} limit 1)`,
      })
      .from(this.table)
      .where(
        and(
          sql`${this.table.id} = ${account}`,
          eq(this.table.organizationId, organizationId),
          sql`exists (select 1 from ${aliasedFrom(d)} where ${d.connectionId} = ${this.table.id} and ${d.workflowId} = ${workflowId} and ${d.status} = 'success')`,
        ),
      )
      .limit(1)
    const row = (rows[0] as DeployedConnection | undefined) ?? null
    if (!row) return null
    row.credentials = await this.tryDecrypt(row.credentials)
    return this.withFresh(row)
  }

  /**
   * A connection row read alongside something else, made usable: decrypted,
   * renewed when due. Never rejects — a failed decrypt keeps the stored value,
   * a failed renewal the current token — so callers can treat it as a lookup.
   */
  async hydrate(row: Connection): Promise<Connection> {
    return this.withFresh({ ...row, credentials: await this.tryDecrypt(row.credentials) })
  }

  /**
   * A run of that workflow with what controlling it needs — its status and
   * instance, the name its provider knows the workflow by (the run's own
   * record, else its deploy's), and its account, joined only when the account
   * is the organization's — one statement. Credentials decrypted (and renewed
   * when due) as `getById` does. Null when there is no such run.
   */
  async getRunControl(
    runId: string,
    workflowId: string,
    organizationId: string,
  ): Promise<RunControlTarget | null> {
    const r = this.t.workflowRuns
    const rows = await this.db
      .select({
        runId: r.id,
        status: r.status,
        instanceId: r.instanceId,
        connectionId: r.connectionId,
        deployedName: sql<
          string | null
        >`coalesce(${r.deployedName}, ${latestDeployedName(this.t.deployments, r)})`,
        connection: this.table,
      })
      .from(r)
      .leftJoin(
        this.table,
        and(eq(this.table.id, r.connectionId), eq(this.table.organizationId, organizationId)),
      )
      .where(and(eq(r.id, runId), eq(r.workflowId, workflowId)))
      .limit(1)
    const row = rows[0] as
      (Omit<RunControlTarget, 'connection'> & { connection: Connection | null }) | undefined
    if (!row) return null
    const connection = row.connection?.id ? await this.hydrate(row.connection) : null
    return {
      runId: row.runId,
      status: row.status,
      instanceId: row.instanceId,
      connectionId: row.connectionId,
      deployedName: row.deployedName ?? null,
      connection,
    }
  }

  /**
   * Where a workflow is live on one of the organization's accounts — the
   * provider, and the URL and version of its newest successful deploy there —
   * one statement, without reading the credentials. Null when it isn't live there.
   * A null `id` is the account its newest successful deploy went out on.
   */
  async getLiveService(
    id: string | null,
    organizationId: string,
    workflowId: string,
  ): Promise<LiveService | null> {
    const live = aliasedTable(this.t.deployments, 'cls')
    const account = accountOf(this.t.deployments, id, workflowId)
    const where = sql`${live.connectionId} = ${account} and ${live.workflowId} = ${workflowId} and ${live.status} = 'success'`
    // Matched by the bound id: an outer column in a select list renders unqualified.
    const newest = <T>(column: unknown) =>
      sql<T>`(select ${column} from ${aliasedFrom(live)} where ${where} order by ${live.createdAt} desc, ${live.id} desc limit 1)`
    const rows = await this.db
      .select({
        connectionId: this.table.id,
        provider: this.table.provider,
        serviceUrl: newest<string | null>(live.serviceUrl),
        versionId: newest<string | null>(live.versionId),
        versionNumber: newest<number | null>(live.versionNumber),
        deployed: sql<unknown>`exists (select 1 from ${aliasedFrom(live)} where ${where})`,
      })
      .from(this.table)
      .where(and(sql`${this.table.id} = ${account}`, eq(this.table.organizationId, organizationId)))
      .limit(1)
    const row = rows[0] as
      | {
          connectionId: string
          provider: string
          serviceUrl: string | null
          versionId: string | null
          versionNumber: number | string | null
          deployed: unknown
        }
      | undefined
    if (!row || !truthy(row.deployed)) return null
    return {
      connectionId: row.connectionId,
      provider: row.provider,
      serviceUrl: row.serviceUrl ?? null,
      versionId: row.versionId ?? null,
      versionNumber: row.versionNumber === null ? null : Number(row.versionNumber),
    }
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
    // A project's own accounts are listed on its page, never the organization's (D-PC-5).
    if (options.id) conditions.push(eq(c.id, options.id))
    else conditions.push(sql`${c.projectId} is null`)
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
      conditions.push(
        sql`${projectId} is not null`,
        servesProject(this.dialect, this.t, c, projectId),
      )
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
    // A scoped key sees only the projects in its reach, by id — never widened
    // to its creator's full set. An empty set shows no project attribution.
    if ('projectIds' in visibleTo) {
      return visibleTo.projectIds.length === 0
        ? sql`1 = 0`
        : sql`${projectId} in ${idList(this.dialect, visibleTo.projectIds)}`
    }
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
    const scope = and(
      eq(this.table.id, id),
      eq(this.table.organizationId, organizationId),
      data.ownedBy === undefined ? undefined : eq(this.table.projectId, data.ownedBy),
      data.expectedUpdatedAt === undefined
        ? undefined
        : eq(this.table.updatedAt, data.expectedUpdatedAt),
    )
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
   * What the project has set up, for its empty pages — one statement: one of
   * its Cloudflare accounts whose token works and hasn't expired, the
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
    const ov = aliasedTable(this.t.envVars, 'psov')
    const pv = aliasedTable(this.t.envVars, 'pspv')
    const k = aliasedTable(this.t.apiKeys, 'psk')
    const akp = aliasedTable(this.t.apiKeyProjects, 'pskp')
    const projectVar = (v: AnyTable) => sql`${v.projectId} = ${p.id} and ${v.workspaceId} is null`
    const rows = (await this.db
      .select({
        cloudflareConnected: fieldOf(
          sql<unknown>`exists (select 1 from ${aliasedFrom(c)} where ${c.organizationId} = ${p.organizationId} and ${c.provider} = 'cloudflare' and ${isProjectsAccount(this.dialect, this.t, c, p.id)} and ${c.tokenStatus} <> 'invalid' and (${c.tokenExpiresAt} is null or ${c.tokenExpiresAt} > ${now}))`,
        ),
        orgVariables: fieldOf(
          sql<number>`(select count(*) from ${aliasedFrom(ov)} where ${ov.organizationId} = ${p.organizationId} and ${ov.projectId} is null and ${ov.workspaceId} is null and ${reachesProject(this.dialect, this.t, ov, p.id)} and not exists (select 1 from ${aliasedFrom(pv)} where ${projectVar(pv)} and ${pv.name} = ${ov.name}))`.mapWith(
            Number,
          ),
        ),
        projectVariables: fieldOf(
          sql<number>`(select count(*) from ${aliasedFrom(pv)} where ${projectVar(pv)})`.mapWith(
            Number,
          ),
        ),
        projectKeys: fieldOf(
          sql<number>`(select count(*) from ${aliasedFrom(k)} where ${k.level} = 'project' and ${k.revokedAt} is null and (${k.expiresAt} is null or ${k.expiresAt} > ${now}) and exists (select 1 from ${aliasedFrom(akp)} where ${akp.keyId} = ${k.id} and ${akp.projectId} = ${p.id} and ${akp.revokedAt} is null))`.mapWith(
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
    // A refresh that finds the grant revoked persists `invalid` before the
    // caller judges the check. Hand back the status as it was read so the
    // caller can still see the transition and tell the keepers; the check
    // itself is recorded by `recordTokenCheck`.
    const fresh: Connection[] = []
    for (const row of rows) {
      const before = row.tokenStatus
      const next = await this.withFresh(row)
      fresh.push({ ...next, tokenStatus: before })
    }
    return fresh
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
   * Besides the org's owners and admins: the creator, and for a project's own
   * account (23a) its project admins — the creator only while they can still
   * see the project.
   */
  private keeperOfOwned(m: AnyTable, c: AnyTable): SQL {
    if (!this.roles) return eq(m.userId, c.createdBy)
    const place = { organizationId: c.organizationId, projectId: c.projectId }
    return sql`((${m.userId} = ${c.createdBy} and (${c.projectId} is null or ${this.roles.projectVisible(m.userId, place)})) or (${c.projectId} is not null and ${this.roles.projectRoleOf(m.userId, place)} = 'admin'))`
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
    const expiresText = isoText(this.dialect, c.tokenExpiresAt)
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
          or(sql`${m.role} in ${ORG_ADMINS}`, this.keeperOfOwned(m, c)),
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
