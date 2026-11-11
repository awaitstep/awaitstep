import { aliasedTable, and, eq, sql, type SQL } from 'drizzle-orm'
import type {
  AvailableConnectionRow,
  DeployTargetRow,
  LiveDeploymentRow,
  ProjectConnectionCreate,
  ProjectConnectionRemoval,
  ProjectConnectionRow,
  ProjectConnectionsRows,
  WorkspaceConnectionChange,
} from '../types.js'
import type { TokenCrypto } from '../crypto.js'
import { atomicallyReturning } from './atomic.js'
import { boundFields } from './insert-where.js'
import {
  aliasedFrom,
  fieldOf,
  idList,
  isoText,
  jsonArrayOf,
  jsonArrayOfValues,
  jsonBool,
  nestedJson,
  readJsonArray,
  type Dialect,
} from './json-array.js'
import { liveOnItsAccount } from './live-deployment.js'
import { isProjectsAccount, servesProject, sqlTrue, type ReachTables } from './connection-reach.js'
import type { RoleFields } from './role-fields.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTable = any

export interface ProjectConnectionTables extends ReachTables {
  workspaceConnections: AnyTable
  projects: AnyTable
  workspaces: AnyTable
  workflows: AnyTable
  deployments: AnyTable
  workflowVersions: AnyTable
  user: AnyTable
}

/** A driver's boolean: pg's own, sqlite's 0/1. */
function truthy(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || value === 't'
}

type ListedConnection = Omit<ProjectConnectionRow, 'deployments'> & {
  deploymentCount: number
  lastDeployAt: string | null
}

/**
 * The accounts a project deploys to (23a): the organization accounts it
 * added and the ones it owns, its default, and where each workspace deploys.
 * Every check — the project's organization, whether an account still serves
 * the project, who may see a workspace — is in the statements' joins and
 * `WHERE`s.
 */
export class ProjectConnectionsAdapter {
  constructor(
    private db: AnyTable,
    private t: ProjectConnectionTables,
    private dialect: Dialect,
    private crypto?: TokenCrypto,
    private roles?: RoleFields,
  ) {}

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

  private yes(): SQL {
    return sqlTrue(this.dialect)
  }

  /** A bound timestamp compared with a stored one: pg's column is `timestamp`. */
  private timestamp(iso: string): SQL {
    return this.dialect === 'pg' ? sql`${iso}::timestamp` : sql`${iso}`
  }

  /** `c` is one of the project's accounts, in the project's organization. */
  private usable(c: AnyTable, p: AnyTable): SQL {
    return sql`(${c.organizationId} = ${p.organizationId} and ${isProjectsAccount(this.dialect, this.t, c, p.id)})`
  }

  /** The project's default account, while it is still one of its accounts: an id or null. */
  private defaultOf(p: AnyTable): SQL {
    const pc = aliasedTable(this.t.projectConnections, 'pdf')
    const c = aliasedTable(this.t.connections, 'pdc')
    return sql`(select ${pc.connectionId} from ${aliasedFrom(pc)} inner join ${aliasedFrom(c)} on ${c.id} = ${pc.connectionId} where ${pc.projectId} = ${p.id} and ${pc.isDefault} = ${this.yes()} and ${this.usable(c, p)})`
  }

  /**
   * Gives up a default flag the project can no longer use (an org admin
   * restricted the account away), so a usable account can take it: the
   * unique index allows one flagged row per project.
   */
  private clearDeadDefault(tx: AnyTable, projectId: string, guard: SQL) {
    const pcT = this.t.projectConnections
    const c = aliasedTable(this.t.connections, 'pdd')
    const p = aliasedTable(this.t.projects, 'pdp')
    return tx
      .update(pcT)
      .set({ isDefault: false })
      .where(
        and(
          eq(pcT.projectId, projectId),
          eq(pcT.isDefault, true),
          guard,
          sql`not exists (select 1 from ${aliasedFrom(c)} inner join ${aliasedFrom(p)} on ${p.id} = ${projectId} where ${c.id} = ${pcT.connectionId} and ${this.usable(c, p)})`,
        ),
      )
      .returning({ id: pcT.connectionId })
  }

  /** The workspace's own account, while it is one of the project's: an id or null. */
  private overrideOf(workspaceId: SQL | unknown, p: AnyTable): SQL {
    const wc = aliasedTable(this.t.workspaceConnections, 'pwo')
    const c = aliasedTable(this.t.connections, 'pwc')
    return sql`(select ${wc.connectionId} from ${aliasedFrom(wc)} inner join ${aliasedFrom(c)} on ${c.id} = ${wc.connectionId} where ${wc.workspaceId} = ${workspaceId} and ${this.usable(c, p)})`
  }

  /** Whether the reader may open the workspace; everyone when no reader is named. */
  private workspaceVisible(viewer: string | undefined, w: AnyTable, p: AnyTable): SQL {
    if (!viewer || !this.roles) return sql`1 = 1`
    return sql`${this.roles.workspaceRoleOf(viewer, { organizationId: p.organizationId, projectId: p.id, workspaceId: w.id })} is not null`
  }

  /**
   * The project's accounts and its workspaces' rows, one statement with the
   * JSON built in SQL. `viewer` sees only the workspaces they can open. Null
   * when the project isn't the organization's.
   */
  async list(
    projectId: string,
    organizationId: string,
    viewer?: string,
  ): Promise<ProjectConnectionsRows | null> {
    const p = aliasedTable(this.t.projects, 'plp')
    const pc = aliasedTable(this.t.projectConnections, 'plpc')
    const c = aliasedTable(this.t.connections, 'plc')
    const u = aliasedTable(this.t.user, 'plu')
    const d = aliasedTable(this.t.deployments, 'pld')
    const wf = aliasedTable(this.t.workflows, 'plwf')
    const dw = aliasedTable(this.t.workspaces, 'pldw')
    const w = aliasedTable(this.t.workspaces, 'plw')
    const lc = aliasedTable(this.t.connections, 'pllc')
    const wd = aliasedTable(this.t.deployments, 'plwd')
    const ww = aliasedTable(this.t.workflows, 'plww')
    // Counted, like named, only from the workspaces the reader can open (security review L3).
    const deployedHere = sql`from ${aliasedFrom(d)} inner join ${aliasedFrom(wf)} on ${wf.id} = ${d.workflowId} inner join ${aliasedFrom(dw)} on ${dw.id} = ${wf.workspaceId} where ${d.connectionId} = ${c.id} and ${wf.projectId} = ${p.id} and ${d.status} = 'success' and ${this.workspaceVisible(viewer, dw, p)}`
    const deployedFrom = sql`(select ${jsonArrayOfValues(this.dialect, sql`names.name`, sql`names.name`)} from (select distinct ${dw.name} as name from ${aliasedFrom(d)} inner join ${aliasedFrom(wf)} on ${wf.id} = ${d.workflowId} inner join ${aliasedFrom(dw)} on ${dw.id} = ${wf.workspaceId} where ${d.connectionId} = ${c.id} and ${wf.projectId} = ${p.id} and ${d.status} = 'success' and ${this.workspaceVisible(viewer, dw, p)}) as names)`
    const accounts = jsonArrayOf(
      this.dialect,
      {
        id: c.id,
        provider: c.provider,
        name: c.name,
        credentials: c.credentials,
        createdByName: sql`(select ${u.name} from ${aliasedFrom(u)} where ${u.id} = ${c.createdBy})`,
        scope: sql`(case when ${c.projectId} is null then 'shared' else 'project' end)`,
        tokenStatus: c.tokenStatus,
        tokenExpiresAt: isoText(this.dialect, c.tokenExpiresAt),
        // A default the project can no longer use is no default (it resolves as none for deploys too).
        isDefault: jsonBool(
          this.dialect,
          sql`${pc.isDefault} = ${this.yes()} and ${servesProject(this.dialect, this.t, c, p.id)}`,
        ),
        available: jsonBool(this.dialect, servesProject(this.dialect, this.t, c, p.id)),
        deploymentCount: sql`(select count(*) ${deployedHere})`,
        lastDeployAt: isoText(this.dialect, sql`(select max(${d.createdAt}) ${deployedHere})`),
        deployedFrom: nestedJson(this.dialect, deployedFrom),
        addedAt: isoText(this.dialect, pc.createdAt),
      },
      sql`${pc.isDefault} desc, ${c.name}, ${c.id}`,
    )
    const override = this.overrideOf(w.id, p)
    const chosen = sql`coalesce(${override}, ${this.defaultOf(p)})`
    const workspaceRows = jsonArrayOf(
      this.dialect,
      {
        workspaceId: w.id,
        name: w.name,
        connectionId: chosen,
        connectionName: sql`(select ${lc.name} from ${aliasedFrom(lc)} where ${lc.id} = ${chosen})`,
        source: sql`(case when ${override} is not null then 'override' when ${this.defaultOf(p)} is not null then 'default' else 'none' end)`,
        lastDeployAt: isoText(
          this.dialect,
          sql`(select max(${wd.createdAt}) from ${aliasedFrom(wd)} inner join ${aliasedFrom(ww)} on ${ww.id} = ${wd.workflowId} where ${ww.workspaceId} = ${w.id} and ${wd.status} = 'success')`,
        ),
      },
      sql`${w.name}, ${w.id}`,
    )
    const rows = (await this.db
      .select({
        connections: fieldOf(
          sql`(select ${accounts} from ${aliasedFrom(pc)} inner join ${aliasedFrom(c)} on ${c.id} = ${pc.connectionId} where ${pc.projectId} = ${p.id} and ${c.organizationId} = ${p.organizationId})`,
        ),
        workspaces: fieldOf(
          sql`(select ${workspaceRows} from ${aliasedFrom(w)} where ${w.projectId} = ${p.id} and ${this.workspaceVisible(viewer, w, p)})`,
        ),
      })
      .from(p)
      .where(and(eq(p.id, projectId), eq(p.organizationId, organizationId)))
      .limit(1)) as { connections: unknown; workspaces: unknown }[]
    const row = rows[0]
    if (!row) return null
    const connections: ProjectConnectionRow[] = []
    for (const listed of readJsonArray<ListedConnection>(row.connections)) {
      const { deploymentCount, lastDeployAt, ...rest } = listed
      connections.push({
        ...rest,
        credentials: await this.tryDecrypt(listed.credentials),
        isDefault: truthy(listed.isDefault),
        available: truthy(listed.available),
        deployments: { count: Number(deploymentCount), lastAt: lastDeployAt },
        deployedFrom: readJsonArray<string>(listed.deployedFrom),
      })
    }
    return { connections, workspaces: readJsonArray(row.workspaces) }
  }

  /**
   * The organization's accounts as the project's Add connection lists them:
   * added, available, or restricted to other projects (named only when the
   * reader can see them). Other projects' own accounts are never listed.
   */
  async available(
    projectId: string,
    organizationId: string,
    viewer?: string,
  ): Promise<AvailableConnectionRow[]> {
    const p = aliasedTable(this.t.projects, 'pap')
    const c = aliasedTable(this.t.connections, 'pac')
    const pc = aliasedTable(this.t.projectConnections, 'papc')
    const cp = aliasedTable(this.t.connectionProjects, 'pacp')
    const op = aliasedTable(this.t.projects, 'paop')
    const serves = servesProject(this.dialect, this.t, c, p.id)
    const added = sql`exists (select 1 from ${aliasedFrom(pc)} where ${pc.projectId} = ${p.id} and ${pc.connectionId} = ${c.id})`
    const visible =
      viewer && this.roles
        ? this.roles.projectVisible(viewer, { organizationId: op.organizationId, projectId: op.id })
        : sql`1 = 1`
    const rows = (await this.db
      .select({
        id: c.id,
        provider: c.provider,
        name: c.name,
        credentials: c.credentials,
        tokenStatus: c.tokenStatus,
        tokenExpiresAt: c.tokenExpiresAt,
        state: sql<string>`(case when not ${serves} then 'restricted' when ${added} then 'added' else 'available' end)`,
        restrictedTo: sql`(case when ${serves} then null else (select ${jsonArrayOfValues(this.dialect, op.name, op.name)} from ${aliasedFrom(cp)} inner join ${aliasedFrom(op)} on ${op.id} = ${cp.projectId} where ${cp.connectionId} = ${c.id} and ${visible}) end)`,
      })
      .from(p)
      .innerJoin(c, and(eq(c.organizationId, p.organizationId), sql`${c.projectId} is null`))
      .where(and(eq(p.id, projectId), eq(p.organizationId, organizationId)))
      .orderBy(c.name, c.id)) as (Omit<AvailableConnectionRow, 'restrictedTo'> & {
      restrictedTo: unknown
    })[]
    const shaped: AvailableConnectionRow[] = []
    for (const row of rows) {
      shaped.push({
        ...row,
        credentials: await this.tryDecrypt(row.credentials),
        restrictedTo: readJsonArray<string>(row.restrictedTo),
      })
    }
    return shaped
  }

  /**
   * Adds organization accounts to the project — only those that serve it —
   * and makes one the default when the project has none (D-PC-8), as one
   * unit. What was newly added, and the default it now has.
   */
  async add(input: {
    projectId: string
    organizationId: string
    connectionIds: string[]
    createdBy: string
  }): Promise<{
    added: { id: string; name: string }[]
    /** Requested ids the project already had: adding them again changes nothing. */
    alreadyAdded: string[]
    defaultId: string | null
  }> {
    const ids = [...new Set(input.connectionIds)]
    if (ids.length === 0) return { added: [], alreadyAdded: [], defaultId: null }
    const now = new Date().toISOString()
    const pcT = this.t.projectConnections
    const p = aliasedTable(this.t.projects, 'pdp')
    const c = aliasedTable(this.t.connections, 'pdc')
    const has = aliasedTable(this.t.projectConnections, 'pdh')
    const dc = aliasedTable(this.t.connections, 'pdd')
    const list = idList(this.dialect, ids)
    const yes = this.yes()
    const results = await atomicallyReturning<unknown>(this.db, (tx) => [
      tx
        .insert(pcT)
        .select(
          tx
            .select({
              ...boundFields(pcT, {
                projectId: input.projectId,
                connectionId: '',
                isDefault: false,
                createdBy: input.createdBy,
                createdAt: now,
              }),
              projectId: p.id,
              connectionId: c.id,
            })
            .from(p)
            .innerJoin(c, eq(c.organizationId, p.organizationId))
            .where(
              and(
                eq(p.id, input.projectId),
                eq(p.organizationId, input.organizationId),
                sql`${c.id} in ${list}`,
                sql`${c.projectId} is null`,
                servesProject(this.dialect, this.t, c, p.id),
              ),
            ),
        )
        .onConflictDoNothing()
        .returning({ id: pcT.connectionId }),
      this.clearDeadDefault(
        tx,
        input.projectId,
        sql`exists (select 1 from ${aliasedFrom(dc)} where ${dc.organizationId} = ${input.organizationId} and ${dc.id} in ${list})`,
      ),
      // The first account a project gets is its default; one it already had stays.
      // Only a row this call wrote is a candidate (its own timestamp and author).
      tx
        .update(pcT)
        .set({ isDefault: true })
        .where(
          and(
            eq(pcT.projectId, input.projectId),
            sql`${pcT.connectionId} = (select ${has.connectionId} from ${aliasedFrom(has)} inner join ${aliasedFrom(dc)} on ${dc.id} = ${has.connectionId} where ${has.projectId} = ${input.projectId} and ${has.connectionId} in ${list} and ${has.createdAt} = ${this.timestamp(now)} and ${has.createdBy} = ${input.createdBy} order by ${dc.name}, ${dc.id} limit 1)`,
            sql`not exists (select 1 from ${aliasedFrom(has)} where ${has.projectId} = ${input.projectId} and ${has.isDefault} = ${yes})`,
          ),
        )
        .returning({ id: pcT.connectionId }),
      tx
        .select({
          id: dc.id,
          name: dc.name,
          had: sql<unknown>`exists (select 1 from ${aliasedFrom(has)} where ${has.projectId} = ${input.projectId} and ${has.connectionId} = ${dc.id})`,
        })
        .from(dc)
        .where(and(sql`${dc.id} in ${list}`, eq(dc.organizationId, input.organizationId))),
    ])
    const inserted = new Set((results[0] as { id: string }[]).map((row) => row.id))
    const madeDefault = (results[2] as { id: string }[])[0]?.id ?? null
    const rows = results[3] as { id: string; name: string; had: unknown }[]
    return {
      added: rows.filter((row) => inserted.has(row.id)).map(({ id, name }) => ({ id, name })),
      alreadyAdded: rows
        .filter((row) => !inserted.has(row.id) && truthy(row.had))
        .map((row) => row.id),
      defaultId: madeDefault,
    }
  }

  /**
   * Connects a new account from the project, as one unit: always the
   * project's own ("This project only") — an account shared with the
   * organization is connected on the org's page. It is the default when
   * asked, or when the project has none. Null when the project isn't the
   * organization's: then nothing is written.
   */
  async create(
    input: ProjectConnectionCreate,
  ): Promise<{ id: string; name: string; isDefault: boolean } | null> {
    const now = new Date().toISOString()
    const cT = this.t.connections
    const pcT = this.t.projectConnections
    const p = aliasedTable(this.t.projects, 'pcp')
    const has = aliasedTable(this.t.projectConnections, 'pch')
    const made = aliasedTable(this.t.connections, 'pcm')
    const yes = this.yes()
    const row = {
      id: input.id,
      organizationId: input.organizationId,
      createdBy: input.createdBy,
      provider: input.provider,
      name: input.name,
      credentials: await this.encrypt(input.credentials),
      allProjects: false,
      tokenStatus: input.token?.status ?? 'unchecked',
      tokenExpiresAt: input.token?.expiresAt ?? null,
      tokenCheckedAt: input.token?.checkedAt ?? null,
      projectId: input.projectId,
      createdAt: now,
      updatedAt: now,
    }
    const exists = sql`exists (select 1 from ${aliasedFrom(made)} where ${made.id} = ${input.id} and ${made.organizationId} = ${input.organizationId})`
    const isDefault = input.makeDefault
      ? yes
      : sql`(case when exists (select 1 from ${aliasedFrom(has)} where ${has.projectId} = ${input.projectId} and ${has.isDefault} = ${yes}) then ${this.dialect === 'pg' ? sql`false` : sql`0`} else ${yes} end)`
    const results = await atomicallyReturning<unknown>(this.db, (tx) => [
      tx
        .insert(cT)
        .select(
          tx
            .select(boundFields(cT, row))
            .from(p)
            .where(and(eq(p.id, input.projectId), eq(p.organizationId, input.organizationId))),
        )
        .returning({ id: cT.id }),
      ...(input.makeDefault ? [] : [this.clearDeadDefault(tx, input.projectId, exists)]),
      // A new default first gives up the old one: the index allows one per project.
      ...(input.makeDefault
        ? [
            tx
              .update(pcT)
              .set({ isDefault: false })
              .where(and(eq(pcT.projectId, input.projectId), eq(pcT.isDefault, true), exists))
              .returning({ id: pcT.connectionId }),
          ]
        : []),
      tx
        .insert(pcT)
        .select(
          tx
            .select({
              projectId: sql`${input.projectId}`.as('project_id'),
              connectionId: sql`${input.id}`.as('connection_id'),
              isDefault: sql`${isDefault}`.as('is_default'),
              createdBy: sql`${input.createdBy}`.as('created_by'),
              createdAt: sql`${this.dialect === 'pg' ? sql`${now}::timestamp` : sql`${now}`}`.as(
                'created_at',
              ),
            })
            .from(sql`(select 1) as one`)
            .where(exists),
        )
        .returning({ id: pcT.connectionId, isDefault: pcT.isDefault }),
    ])
    if ((results[0] ?? []).length === 0) return null
    const added = (results[results.length - 1] as { id: string; isDefault: unknown }[])[0]
    return { id: input.id, name: input.name, isDefault: truthy(added?.isDefault) }
  }

  /** Makes one of the project's accounts its default, as one unit. Its name, or null when it isn't one. */
  async setDefault(projectId: string, connectionId: string): Promise<string | null> {
    const pcT = this.t.projectConnections
    const p = aliasedTable(this.t.projects, 'psp')
    const c = aliasedTable(this.t.connections, 'psc')
    const target = sql`exists (select 1 from ${aliasedFrom(c)} inner join ${aliasedFrom(p)} on ${p.id} = ${projectId} where ${c.id} = ${connectionId} and ${this.usable(c, p)})`
    const results = await atomicallyReturning<unknown>(this.db, (tx) => [
      tx
        .update(pcT)
        .set({ isDefault: false })
        .where(
          and(
            eq(pcT.projectId, projectId),
            eq(pcT.isDefault, true),
            sql`${pcT.connectionId} <> ${connectionId}`,
            target,
          ),
        )
        .returning({ id: pcT.connectionId }),
      tx
        .update(pcT)
        .set({ isDefault: true })
        .where(and(eq(pcT.projectId, projectId), eq(pcT.connectionId, connectionId), target))
        .returning({ id: pcT.connectionId }),
      tx.select({ name: c.name }).from(c).where(eq(c.id, connectionId)).limit(1),
    ])
    if ((results[1] ?? []).length === 0) return null
    return (results[2] as { name: string }[])[0]?.name ?? null
  }

  /**
   * Points a workspace of the project at one of its accounts, or (null) back
   * to the project default. The names found, which say what refused it.
   */
  async setWorkspaceConnection(input: {
    projectId: string
    workspaceId: string
    connectionId: string | null
    setBy: string
  }): Promise<WorkspaceConnectionChange> {
    const wcT = this.t.workspaceConnections
    const w = aliasedTable(this.t.workspaces, 'pww')
    const p = aliasedTable(this.t.projects, 'pwp')
    const c = aliasedTable(this.t.connections, 'pwc')
    const inProject = this.db
      .select({ id: w.id })
      .from(w)
      .where(and(eq(w.id, input.workspaceId), eq(w.projectId, input.projectId)))
    const { connectionId } = input
    const results = await atomicallyReturning<unknown>(this.db, (tx) => [
      connectionId === null
        ? tx
            .delete(wcT)
            .where(
              and(
                eq(wcT.workspaceId, input.workspaceId),
                sql`${wcT.workspaceId} in (${inProject})`,
              ),
            )
            .returning({ id: wcT.workspaceId })
        : tx
            .insert(wcT)
            .select(
              tx
                .select({
                  ...boundFields(wcT, {
                    workspaceId: '',
                    connectionId,
                    setBy: input.setBy,
                    setAt: new Date().toISOString(),
                  }),
                  workspaceId: w.id,
                })
                .from(w)
                .innerJoin(p, eq(p.id, w.projectId))
                .innerJoin(c, eq(c.id, connectionId))
                .where(
                  and(
                    eq(w.id, input.workspaceId),
                    eq(w.projectId, input.projectId),
                    this.usable(c, p),
                  ),
                ),
            )
            .onConflictDoUpdate({
              target: wcT.workspaceId,
              set: {
                connectionId: sql`excluded.connection_id`,
                setBy: sql`excluded.set_by`,
                setAt: sql`excluded.set_at`,
              },
            })
            .returning({ id: wcT.workspaceId }),
      tx
        .select({
          workspaceName: w.name,
          connectionName:
            connectionId === null
              ? sql<string | null>`null`
              : sql<
                  string | null
                >`(select ${c.name} from ${aliasedFrom(c)} where ${c.id} = ${connectionId} and ${this.usable(c, p)})`,
        })
        .from(w)
        .innerJoin(p, eq(p.id, w.projectId))
        .where(and(eq(w.id, input.workspaceId), eq(w.projectId, input.projectId)))
        .limit(1),
    ])
    const found = (results[1] as { workspaceName: string; connectionName: string | null }[])[0]
    return {
      workspaceName: found?.workspaceName ?? null,
      connectionName: found?.connectionName ?? null,
      changed: (results[0] ?? []).length > 0,
    }
  }

  /**
   * Takes an account off the project as one unit: an added one leaves the
   * project, an owned one is deleted. Workspaces that deployed to it follow
   * the project default again; a removed default leaves none, unless one
   * account is left, which becomes it (D-PC-6, D-PC-8). An owned account
   * workflows are still deployed with is kept — deleting it would leave their
   * workers running with no credentials to take them down or run them — and
   * `blockedBy` names those workflows. Null when it wasn't one of the project's.
   */
  async remove(projectId: string, connectionId: string): Promise<ProjectConnectionRemoval | null> {
    const pcT = this.t.projectConnections
    const wcT = this.t.workspaceConnections
    const cT = this.t.connections
    const pc = aliasedTable(this.t.projectConnections, 'prp')
    const c = aliasedTable(this.t.connections, 'prc')
    const w = aliasedTable(this.t.workspaces, 'prw')
    const left = aliasedTable(this.t.projectConnections, 'prl')
    const oc = aliasedTable(this.t.connections, 'pro')
    const d = aliasedTable(this.t.deployments, 'prd')
    const wf = aliasedTable(this.t.workflows, 'prf')
    const yes = this.yes()
    const projectWorkspaces = this.db.select({ id: w.id }).from(w).where(eq(w.projectId, projectId))
    // Workflows whose workers went out with this account and haven't been taken down.
    const live = sql`from ${aliasedFrom(wf)} where ${wf.currentVersionId} is not null and exists (select 1 from ${aliasedFrom(d)} where ${d.workflowId} = ${wf.id} and ${d.connectionId} = ${connectionId} and ${d.status} = 'success')`
    const kept = sql`not (exists (select 1 from ${aliasedFrom(oc)} where ${oc.id} = ${connectionId} and ${oc.projectId} = ${projectId}) and exists (select 1 ${live}))`
    const results = await atomicallyReturning<unknown>(this.db, (tx) => [
      tx
        .select({
          name: c.name,
          owned: sql<unknown>`(case when ${c.projectId} = ${projectId} then ${yes} else ${this.dialect === 'pg' ? sql`false` : sql`0`} end)`,
          isDefault: pc.isDefault,
          // Named only within this project; any elsewhere (moved since) are counted.
          blockedBy: sql<unknown>`(case when ${kept} then null else (select ${jsonArrayOfValues(this.dialect, wf.name, wf.name)} ${live} and ${wf.projectId} = ${projectId}) end)`,
          blockedElsewhere:
            sql<number>`(case when ${kept} then 0 else (select count(*) ${live} and ${wf.projectId} <> ${projectId}) end)`.mapWith(
              Number,
            ),
        })
        .from(pc)
        .innerJoin(c, eq(c.id, pc.connectionId))
        .where(and(eq(pc.projectId, projectId), eq(pc.connectionId, connectionId)))
        .limit(1),
      tx
        .delete(wcT)
        .where(
          and(
            eq(wcT.connectionId, connectionId),
            sql`${wcT.workspaceId} in (${projectWorkspaces})`,
            kept,
          ),
        )
        .returning({ id: wcT.workspaceId }),
      tx
        .delete(pcT)
        .where(and(eq(pcT.projectId, projectId), eq(pcT.connectionId, connectionId), kept))
        .returning({ id: pcT.connectionId }),
      tx
        .delete(cT)
        .where(and(eq(cT.id, connectionId), eq(cT.projectId, projectId), kept))
        .returning({ id: cT.id }),
      tx
        .update(pcT)
        .set({ isDefault: true })
        .where(
          and(
            eq(pcT.projectId, projectId),
            sql`(select count(*) from ${aliasedFrom(left)} where ${left.projectId} = ${projectId}) = 1`,
            kept,
            sql`not exists (select 1 from ${aliasedFrom(left)} where ${left.projectId} = ${projectId} and ${left.isDefault} = ${yes})`,
          ),
        )
        .returning({ id: pcT.connectionId }),
    ])
    const found = (
      results[0] as {
        name: string
        owned: unknown
        isDefault: unknown
        blockedBy: unknown
        blockedElsewhere: number
      }[]
    )[0]
    if (!found) return null
    const blockedBy = readJsonArray<string>(found.blockedBy)
    const blockedElsewhere = Number(found.blockedElsewhere)
    const blocked = blockedBy.length > 0 || blockedElsewhere > 0
    if (!blocked && (results[2] ?? []).length === 0) return null
    return {
      name: found.name,
      owned: truthy(found.owned),
      wasDefault: truthy(found.isDefault),
      workspacesCleared: (results[1] ?? []).length,
      blockedBy,
      blockedElsewhere,
    }
  }

  /**
   * What is live on each account the workflow has a successful deployment
   * with — that account's newest one, with its version and who sent it —
   * latest first, in its project's organization: what a trigger may name.
   * One statement.
   */
  async liveDeployments(workflowId: string): Promise<LiveDeploymentRow[]> {
    const d = aliasedTable(this.t.deployments, 'pdw')
    const newer = aliasedTable(this.t.deployments, 'pdwn')
    const wf = aliasedTable(this.t.workflows, 'pdwf')
    const p = aliasedTable(this.t.projects, 'pdwp')
    const c = aliasedTable(this.t.connections, 'pdwc')
    const v = aliasedTable(this.t.workflowVersions, 'pdwv')
    const u = aliasedTable(this.t.user, 'pdwu')
    const rows = (await this.db
      .select({
        id: c.id,
        name: c.name,
        deploymentId: d.id,
        serviceUrl: d.serviceUrl,
        provider: c.provider,
        versionId: d.versionId,
        // Its number outlives the version row.
        version: sql<number | null>`coalesce(${v.version}, ${d.versionNumber})`,
        versionLocked: v.locked,
        deployedAt: d.createdAt,
        deployedByName: u.name,
      })
      .from(d)
      .innerJoin(wf, eq(wf.id, d.workflowId))
      .innerJoin(p, eq(p.id, wf.projectId))
      .innerJoin(c, and(eq(c.id, d.connectionId), eq(c.organizationId, p.organizationId)))
      .leftJoin(v, eq(v.id, d.versionId))
      .leftJoin(u, eq(u.id, d.createdBy))
      .where(and(eq(d.workflowId, workflowId), liveOnItsAccount(d, newer)))
      .orderBy(sql`${d.createdAt} desc`, c.id)) as (Omit<
      LiveDeploymentRow,
      'version' | 'versionLocked'
    > & {
      version: number | string | null
      versionLocked: number | null
    })[]
    return rows.map((row) => ({
      ...row,
      version: row.version === null ? null : Number(row.version),
      versionLocked: row.versionLocked === 1,
    }))
  }

  /**
   * The accounts Deploy offers a workflow of the project, each flagged when
   * it is the one already chosen: the workspace's own, else the project's
   * default. One statement.
   */
  async deployTargets(projectId: string, workspaceId: string | null): Promise<DeployTargetRow[]> {
    const p = aliasedTable(this.t.projects, 'ptp')
    const pc = aliasedTable(this.t.projectConnections, 'ptpc')
    const c = aliasedTable(this.t.connections, 'ptc')
    const chosen =
      workspaceId === null
        ? this.defaultOf(p)
        : sql`coalesce(${this.overrideOf(workspaceId, p)}, ${this.defaultOf(p)})`
    const rows = (await this.db
      .select({
        id: c.id,
        provider: c.provider,
        name: c.name,
        credentials: c.credentials,
        scope: sql<string>`(case when ${c.projectId} is null then 'shared' else 'project' end)`,
        tokenStatus: c.tokenStatus,
        tokenExpiresAt: c.tokenExpiresAt,
        chosen: sql<unknown>`(case when ${c.id} = ${chosen} then ${this.yes()} else ${this.dialect === 'pg' ? sql`false` : sql`0`} end)`,
      })
      .from(pc)
      .innerJoin(p, eq(p.id, pc.projectId))
      .innerJoin(c, eq(c.id, pc.connectionId))
      .where(and(eq(pc.projectId, projectId), this.usable(c, p)))
      .orderBy(c.name, c.id)) as (Omit<DeployTargetRow, 'chosen'> & { chosen: unknown })[]
    const shaped: DeployTargetRow[] = []
    for (const row of rows) {
      shaped.push({
        ...row,
        credentials: await this.tryDecrypt(row.credentials),
        chosen: truthy(row.chosen),
      })
    }
    return shaped
  }
}
