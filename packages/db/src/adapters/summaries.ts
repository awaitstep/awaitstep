import { and, eq, sql, aliasedTable, type SQL } from 'drizzle-orm'
import type {
  FailingSummary,
  OrgActivityItem,
  OrgHomeSummary,
  ProjectSummary,
  ResourceCounts,
  SharedSummaryItem,
  SummaryPerson,
  WorkflowDeploySummary,
  WorkflowPageSummary,
  WorkspaceAttentionItem,
  WorkspacePageOverview,
  WorkspaceRecentRun,
  WorkspaceSettingsCounts,
} from '../types.js'
import {
  aliasedFrom,
  fieldOf,
  isoText,
  jsonArrayOfValues,
  nestedJson,
  readJsonArray,
  type Dialect,
} from './json-array.js'
import { FAILED_RUN_STATUSES, OverviewFields, type OverviewTables } from './overview-fields.js'
import { reachesProject, reachesWorkspace } from './variable-reach.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTable = any

/** Everything the summary cards read, beside the dashboard tables. */
export interface SummaryTables extends OverviewTables {
  apiKeys: AnyTable
  apiKeyProjects: AnyTable
  apiKeyWorkspaces: AnyTable
  envVars: AnyTable
  envVarProjects: AnyTable
  envVarWorkspaces: AnyTable
  installedNodes: AnyTable
  connections: AnyTable
}

const ORG_ADMINS = sql.raw(`('owner', 'admin')`)
const FAILED_LIST = sql.raw(FAILED_RUN_STATUSES.map((s) => `'${s}'`).join(', '))
// The org home shows a glance, not a log: the audit log has the rest.
const ACTIVITY_LIMIT = 5

/**
 * The page summaries: one statement each, shaped to the section that renders
 * it. No list is fetched to count it, and no address, secret or credential is
 * named.
 */
export class SummaryAdapter {
  private fields: OverviewFields

  constructor(
    private db: AnyTable,
    private t: SummaryTables,
    private dialect: Dialect,
  ) {
    this.fields = new OverviewFields(t, dialect)
  }

  private object(pairs: [string, SQL][]): SQL {
    const joined = sql.join(
      pairs.flatMap(([key, value]) => [sql.raw(`'${key}'`), value]),
      sql`, `,
    )
    return sql`${sql.raw(this.dialect === 'pg' ? 'json_build_object' : 'json_object')}(${joined})`
  }

  private jsonList(pairs: [string, SQL][], inner: SQL, orderBy: SQL): SQL {
    return sql`(select ${jsonArrayOfValues(this.dialect, this.object(pairs), orderBy)} from (${inner}) x)`
  }

  /** The org home's Failing now: how many, and the first row's names and run. */
  async orgHome(organizationId: string, viewerId: string): Promise<OrgHomeSummary | null> {
    const o = aliasedTable(this.t.organization, 'sho')
    const wf = aliasedTable(this.t.workflows, 'shw')
    const w = aliasedTable(this.t.workspaces, 'shs')
    const p = aliasedTable(this.t.projects, 'shp')
    const r = aliasedTable(this.t.workflowRuns, 'shr')
    const latest = aliasedTable(this.t.workflowRuns, 'shl')
    const roles = this.fields.roles
    const viewer = { userId: viewerId, organizationId: o.id }
    const health = this.fields.orgHealth(viewer)
    const latestId = sql`(select ${latest.id} from ${aliasedFrom(latest)} where ${latest.workflowId} = ${wf.id} order by ${latest.createdAt} desc limit 1)`
    const visible = sql`${roles.workspaceRoleOf(viewerId, { organizationId: p.organizationId, projectId: p.id, workspaceId: w.id })} is not null`
    const inner = sql`select ${wf.id} as id, ${wf.name} as name, ${wf.kind} as kind, ${p.slug} as project_slug, ${p.name} as project_name, ${w.slug} as workspace_slug, ${w.name} as workspace_name, ${w.colour} as workspace_colour, ${r.id} as run_id, ${r.workflowId} as run_workflow_id, ${r.versionId} as run_version_id, ${r.versionNumber} as run_version_number, ${r.status} as run_status, ${r.createdAt} as run_created_at, ${r.updatedAt} as run_updated_at from ${aliasedFrom(wf)} inner join ${aliasedFrom(w)} on ${w.id} = ${wf.workspaceId} inner join ${aliasedFrom(p)} on ${p.id} = ${w.projectId} inner join ${aliasedFrom(r)} on ${r.id} = ${latestId} where ${p.organizationId} = ${o.id} and ${visible} and ${r.status} in ('errored', 'terminated') order by ${r.createdAt} desc, ${r.id} desc limit 1`
    const first = this.jsonList(
      [
        [
          'workflow',
          nestedJson(
            this.dialect,
            sql`${sql.raw(this.dialect === 'pg' ? 'json_build_object' : 'json_object')}('id', x.id, 'name', x.name, 'kind', x.kind)`,
          ),
        ],
        [
          'project',
          sql`${sql.raw(this.dialect === 'pg' ? 'json_build_object' : 'json_object')}('slug', x.project_slug, 'name', x.project_name)`,
        ],
        [
          'workspace',
          sql`${sql.raw(this.dialect === 'pg' ? 'json_build_object' : 'json_object')}('slug', x.workspace_slug, 'name', x.workspace_name, 'colour', x.workspace_colour)`,
        ],
        [
          'run',
          sql`${sql.raw(this.dialect === 'pg' ? 'json_build_object' : 'json_object')}('id', x.run_id, 'workflowId', x.run_workflow_id, 'versionId', x.run_version_id, 'versionNumber', x.run_version_number, 'status', x.run_status, 'createdAt', x.run_created_at, 'updatedAt', x.run_updated_at)`,
        ],
      ],
      inner,
      sql`x.run_created_at desc, x.run_id desc`,
    )
    const activity = this.orgActivity(o, viewerId)
    const rows = await this.db
      .select({ failing: health.failing, first, activity })
      .from(o)
      .where(eq(o.id, organizationId))
      .limit(1)
    const row = rows[0]
    if (!row) return null
    const firstRows = readJsonArray<FailingSummary>(row.first)
    return {
      failing: { count: Number(row.failing), first: firstRows[0] ?? null },
      activity: readJsonArray<OrgActivityItem>(row.activity),
    }
  }

  /**
   * The org home's Recent activity, newest first: every successful deploy,
   * each workflow's latest failed run (a workflow failing every minute takes
   * one row, not all of them), and each share to the project — only in
   * workspaces the viewer can open.
   */
  private orgActivity(o: AnyTable, viewerId: string): SQL {
    const d = aliasedTable(this.t.deployments, 'oad')
    const r = aliasedTable(this.t.workflowRuns, 'oar')
    const lr = aliasedTable(this.t.workflowRuns, 'oal')
    const wf = aliasedTable(this.t.workflows, 'oaw')
    const w = aliasedTable(this.t.workspaces, 'oas')
    const p = aliasedTable(this.t.projects, 'oap')
    const roles = this.fields.roles
    const visible = sql`${roles.workspaceRoleOf(viewerId, { organizationId: p.organizationId, projectId: p.id, workspaceId: w.id })} is not null`
    const place = sql`${wf.name} as wf_name, ${wf.kind} as wf_kind, ${p.slug} as project_slug, ${p.name} as project_name, ${w.slug} as workspace_slug, ${w.name} as workspace_name, ${w.colour} as workspace_colour`
    const from = sql`from ${aliasedFrom(wf)} inner join ${aliasedFrom(w)} on ${w.id} = ${wf.workspaceId} inner join ${aliasedFrom(p)} on ${p.id} = ${w.projectId}`
    const scoped = sql`${p.organizationId} = ${o.id} and ${visible}`
    const noVersion = sql`cast(null as integer)`
    const latestFailed = sql`(select ${lr.id} from ${aliasedFrom(lr)} where ${lr.workflowId} = ${wf.id} and ${lr.status} in (${FAILED_LIST}) order by ${lr.createdAt} desc, ${lr.id} desc limit 1)`

    const deployed = sql`select 'deployed:' || ${d.id} as id, 'deployed' as kind, ${d.createdAt} as at, ${d.versionNumber} as version, ${place} ${from} inner join ${aliasedFrom(d)} on ${d.workflowId} = ${wf.id} where ${scoped} and ${d.status} = 'success'`
    const failed = sql`select 'failed:' || ${r.id} as id, 'failed' as kind, ${r.createdAt} as at, ${noVersion} as version, ${place} ${from} inner join ${aliasedFrom(r)} on ${r.id} = ${latestFailed} where ${scoped}`
    const shared = sql`select 'shared:' || ${wf.id} as id, 'shared' as kind, ${wf.sharedAt} as at, ${noVersion} as version, ${place} ${from} where ${scoped} and ${wf.sharedAt} is not null`
    const inner = sql`${deployed} union all ${failed} union all ${shared} order by at desc, id desc limit ${sql.raw(String(ACTIVITY_LIMIT))}`

    return this.jsonList(
      [
        ['id', sql`x.id`],
        ['kind', sql`x.kind`],
        [
          'workflow',
          this.object([
            ['name', sql`x.wf_name`],
            ['kind', sql`x.wf_kind`],
          ]),
        ],
        ['version', sql`x.version`],
        [
          'project',
          this.object([
            ['slug', sql`x.project_slug`],
            ['name', sql`x.project_name`],
          ]),
        ],
        [
          'workspace',
          this.object([
            ['slug', sql`x.workspace_slug`],
            ['name', sql`x.workspace_name`],
            ['colour', sql`x.workspace_colour`],
          ]),
        ],
        ['at', isoText(this.dialect, sql`x.at`)],
      ],
      inner,
      sql`x.at desc, x.id desc`,
    )
  }

  /** The workspaces page's Project-wide cards, in one statement. */
  async projectSummary(
    organizationId: string,
    projectId: string,
    now: string,
  ): Promise<ProjectSummary | null> {
    const p = aliasedTable(this.t.projects, 'psp')
    const m = aliasedTable(this.t.member, 'psm')
    const u = aliasedTable(this.t.user, 'psu')
    const k = aliasedTable(this.t.apiKeys, 'psk')
    const akp = aliasedTable(this.t.apiKeyProjects, 'psakp')
    const v = aliasedTable(this.t.envVars, 'psv')
    const shadow = aliasedTable(this.t.envVars, 'pssh')
    const pv = aliasedTable(this.t.envVars, 'pspv')
    const wf = aliasedTable(this.t.workflows, 'pswf')
    const w = aliasedTable(this.t.workspaces, 'psw')

    const adminInner = sql`select ${u.id} as id, ${u.name} as name, ${u.image} as image from ${aliasedFrom(m)} inner join ${aliasedFrom(u)} on ${u.id} = ${m.userId} where ${m.organizationId} = ${p.organizationId} and (${m.role} in ${ORG_ADMINS} or ${this.fields.roles.projectGrantOf(u.id, p.id)} = 'admin') order by ${u.name}, ${u.id} limit 5`
    const adminCount = sql`(select count(*) from ${aliasedFrom(m)} where ${m.organizationId} = ${p.organizationId} and (${m.role} in ${ORG_ADMINS} or ${this.fields.roles.projectGrantOf(m.userId, p.id)} = 'admin'))`
    const admins = this.jsonList(
      [
        ['id', sql`x.id`],
        ['name', sql`x.name`],
        ['image', sql`x.image`],
      ],
      adminInner,
      sql`x.name, x.id`,
    )
    const projectKeys = sql`(select count(*) from ${aliasedFrom(k)} where ${k.level} = 'project' and ${k.revokedAt} is null and (${k.expiresAt} is null or ${k.expiresAt} > ${now}) and exists (select 1 from ${aliasedFrom(akp)} where ${akp.keyId} = ${k.id} and ${akp.projectId} = ${p.id} and ${akp.revokedAt} is null))`
    const resolvedNames = sql`select ${v.name} as name from ${aliasedFrom(v)} where ${v.organizationId} = ${p.organizationId} and ${v.workspaceId} is null and (${v.projectId} = ${p.id} or (${v.projectId} is null and ${reachesProject(this.dialect, this.t, v, p.id)} and not exists (select 1 from ${aliasedFrom(shadow)} where ${shadow.projectId} = ${p.id} and ${shadow.workspaceId} is null and ${shadow.name} = ${v.name})))`
    const total = sql`(select count(*) from (${resolvedNames}) rn)`
    const own = sql`(select count(*) from ${aliasedFrom(pv)} where ${pv.projectId} = ${p.id} and ${pv.workspaceId} is null)`
    const firstName = sql`(select ${jsonArrayOfValues(this.dialect, sql`rn.name`, sql`rn.name`)} from (select name from (${resolvedNames}) all_names order by name limit 2) rn)`
    const sharedInner = sql`select ${wf.id} as id, ${wf.name} as name, ${wf.kind} as kind, ${w.id} as workspace_id, ${w.slug} as workspace_slug, ${w.name} as workspace_name, ${w.colour} as workspace_colour from ${aliasedFrom(wf)} inner join ${aliasedFrom(w)} on ${w.id} = ${wf.workspaceId} where ${wf.projectId} = ${p.id} and ${wf.sharedAt} is not null order by ${wf.name}, ${wf.id} limit 2`
    const sharedCount = sql`(select count(*) from ${aliasedFrom(wf)} where ${wf.projectId} = ${p.id} and ${wf.sharedAt} is not null)`
    const shared = this.jsonList(
      [
        ['id', sql`x.id`],
        ['name', sql`x.name`],
        ['kind', sql`x.kind`],
        [
          'from',
          sql`${sql.raw(this.dialect === 'pg' ? 'json_build_object' : 'json_object')}('id', x.workspace_id, 'slug', x.workspace_slug, 'name', x.workspace_name, 'colour', x.workspace_colour)`,
        ],
      ],
      sharedInner,
      sql`x.name, x.id`,
    )

    const rows = await this.db
      .select({ adminCount, admins, projectKeys, total, own, firstName, sharedCount, shared })
      .from(p)
      .where(and(eq(p.id, projectId), eq(p.organizationId, organizationId)))
      .limit(1)
    const row = rows[0]
    if (!row) return null
    const totalCount = Number(row.total)
    return {
      admins: {
        count: Number(row.adminCount),
        people: readJsonArray<SummaryPerson>(row.admins),
      },
      projectKeys: Number(row.projectKeys),
      variables: {
        total: totalCount,
        own: Number(row.own),
        inherited: totalCount - Number(row.own),
        first: readJsonArray<string>(row.firstName),
      },
      shared: {
        count: Number(row.sharedCount),
        first: readJsonArray<SharedSummaryItem>(row.shared),
      },
    }
  }

  /** Workspace Settings' three tab pills: members, keys and variables. */
  async workspaceSettingsCounts(
    workspaceId: string,
    now: string,
  ): Promise<WorkspaceSettingsCounts | null> {
    const w = aliasedTable(this.t.workspaces, 'wsc')
    const p = aliasedTable(this.t.projects, 'wsp')
    const m = aliasedTable(this.t.member, 'wsm')
    const k = aliasedTable(this.t.apiKeys, 'wsk')
    const akp = aliasedTable(this.t.apiKeyProjects, 'wsakp')
    const akw = aliasedTable(this.t.apiKeyWorkspaces, 'wsakw')
    const v = aliasedTable(this.t.envVars, 'wsv')
    const visible = sql`${m.organizationId} = ${p.organizationId} and (${m.role} in ${ORG_ADMINS} or ${this.fields.roles.projectGrantOf(m.userId, p.id)} is not null or ${this.fields.roles.workspaceGrantOf(m.userId, w.id)} is not null)`
    const members = sql`(select count(*) from ${aliasedFrom(m)} where ${visible})`
    const keys = sql`(select count(distinct ${k.id}) from ${aliasedFrom(k)} where ${k.revokedAt} is null and (${k.expiresAt} is null or ${k.expiresAt} > ${now}) and ((exists (select 1 from ${aliasedFrom(akw)} where ${akw.keyId} = ${k.id} and ${akw.workspaceId} = ${w.id} and ${akw.revokedAt} is null)) or (${k.level} = 'project' and exists (select 1 from ${aliasedFrom(akp)} where ${akp.keyId} = ${k.id} and ${akp.projectId} = ${p.id} and ${akp.revokedAt} is null))))`
    // Each name once: the workspace's own, the project's that reaches it, the org's that reaches the project.
    const names = sql`select ${v.name} as name from ${aliasedFrom(v)} where ${v.organizationId} = ${p.organizationId} and ((${v.workspaceId} = ${w.id}) or (${v.projectId} = ${p.id} and ${v.workspaceId} is null and ${reachesWorkspace(this.dialect, this.t, v, w.id)}) or (${v.projectId} is null and ${reachesProject(this.dialect, this.t, v, p.id)}))`
    const variables = sql`(select count(distinct rn.name) from (${names}) rn)`
    const rows = await this.db
      .select({ members, keys, variables })
      .from(w)
      .innerJoin(p, eq(p.id, w.projectId))
      .where(eq(w.id, workspaceId))
      .limit(1)
    const row = rows[0]
    if (!row) return null
    return {
      members: Number(row.members),
      keys: Number(row.keys),
      variables: Number(row.variables),
    }
  }

  /** A workspace's Overview: counts, the failing items, recent runs and shares. */
  async workspaceOverview(workspaceId: string, now: Date): Promise<WorkspacePageOverview | null> {
    const w = aliasedTable(this.t.workspaces, 'wso')
    const wf = aliasedTable(this.t.workflows, 'wsw')
    const r = aliasedTable(this.t.workflowRuns, 'wsr')
    const rl = aliasedTable(this.t.workflowRuns, 'wsrl')
    const r10 = aliasedTable(this.t.workflowRuns, 'wsr10')
    const sw = aliasedTable(this.t.workspaces, 'wssw')
    const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()

    const latestId = sql`(select ${rl.id} from ${aliasedFrom(rl)} where ${rl.workflowId} = ${wf.id} order by ${rl.createdAt} desc, ${rl.id} desc limit 1)`
    const attentionInner = sql`select ${wf.id} as item_id, ${wf.name} as item_name, ${wf.kind} as item_kind, ${r.id} as run_id, ${r.workflowId} as run_workflow_id, ${r.status} as run_status, ${r.createdAt} as run_created_at, ${r.error} as run_error, (select count(*) from (select ${r10.status} from ${aliasedFrom(r10)} where ${r10.workflowId} = ${wf.id} order by ${r10.createdAt} desc, ${r10.id} desc limit 10) last_ten) as total, (select count(*) from (select ${r10.status} from ${aliasedFrom(r10)} where ${r10.workflowId} = ${wf.id} order by ${r10.createdAt} desc, ${r10.id} desc limit 10) last_ten where last_ten.status in ('errored', 'terminated')) as failures from ${aliasedFrom(wf)} inner join ${aliasedFrom(r)} on ${r.id} = ${latestId} where ${wf.workspaceId} = ${w.id} and ${r.status} in ('errored', 'terminated') order by ${r.createdAt} desc, ${r.id} desc`
    const attention = this.jsonList(
      [
        [
          'item',
          nestedJson(
            this.dialect,
            sql`${sql.raw(this.dialect === 'pg' ? 'json_build_object' : 'json_object')}('id', x.item_id, 'name', x.item_name, 'kind', x.item_kind)`,
          ),
        ],
        [
          'run',
          nestedJson(
            this.dialect,
            sql`${sql.raw(this.dialect === 'pg' ? 'json_build_object' : 'json_object')}('id', x.run_id, 'workflowId', x.run_workflow_id, 'status', x.run_status, 'createdAt', x.run_created_at, 'error', x.run_error)`,
          ),
        ],
        ['failures', sql`x.failures`],
        ['total', sql`x.total`],
      ],
      attentionInner,
      sql`x.run_created_at desc, x.run_id desc`,
    )

    const recentInner = sql`select t.run_id, t.run_workflow_id, t.run_workflow_name, t.run_kind, t.run_status, t.run_created_at from (select ${r.id} as run_id, ${r.workflowId} as run_workflow_id, ${wf.name} as run_workflow_name, ${wf.kind} as run_kind, ${r.status} as run_status, ${r.createdAt} as run_created_at, row_number() over (partition by ${r.workflowId} order by ${r.createdAt} desc, ${r.id} desc) as rn from ${aliasedFrom(r)} inner join ${aliasedFrom(wf)} on ${wf.id} = ${r.workflowId} where ${wf.workspaceId} = ${w.id} and ${r.status} in ('complete', 'errored', 'terminated')) t where t.rn = 1 order by t.run_created_at desc, t.run_id desc limit 4`
    const recent = this.jsonList(
      [
        ['id', sql`x.run_id`],
        ['workflowId', sql`x.run_workflow_id`],
        ['workflowName', sql`x.run_workflow_name`],
        ['kind', sql`x.run_kind`],
        ['status', sql`x.run_status`],
        ['createdAt', sql`x.run_created_at`],
      ],
      recentInner,
      sql`x.run_created_at desc, x.run_id desc`,
    )

    const outInner = sql`select ${wf.id} as id, ${wf.name} as name from ${aliasedFrom(wf)} where ${wf.workspaceId} = ${w.id} and ${wf.sharedAt} is not null order by ${wf.name}, ${wf.id}`
    const out = this.jsonList(
      [
        ['id', sql`x.id`],
        ['name', sql`x.name`],
      ],
      outInner,
      sql`x.name, x.id`,
    )
    const inInner = sql`select ${wf.id} as id, ${wf.name} as name, ${wf.kind} as kind, ${sw.id} as from_id, ${sw.slug} as from_slug, ${sw.name} as from_name, ${sw.colour} as from_colour from ${aliasedFrom(wf)} inner join ${aliasedFrom(sw)} on ${sw.id} = ${wf.workspaceId} where ${sw.projectId} = ${w.projectId} and ${wf.sharedAt} is not null and ${wf.workspaceId} <> ${w.id} order by ${wf.name}, ${wf.id}`
    const incoming = this.jsonList(
      [
        ['id', sql`x.id`],
        ['name', sql`x.name`],
        ['kind', sql`x.kind`],
        [
          'from',
          nestedJson(
            this.dialect,
            sql`${sql.raw(this.dialect === 'pg' ? 'json_build_object' : 'json_object')}('id', x.from_id, 'slug', x.from_slug, 'name', x.from_name, 'colour', x.from_colour)`,
          ),
        ],
      ],
      inInner,
      sql`x.name, x.id`,
    )

    const counts = this.fields.workspaceCounts(w.id, since)
    const rows = await this.db
      .select({
        counts: {
          workflows: fieldOf(counts.workflows),
          deployed: fieldOf(counts.deployed),
          functions: fieldOf(counts.functions),
          sharedOut: fieldOf(counts.sharedOut),
          failing: fieldOf(counts.failing),
          runs24h: fieldOf(counts.runs24h),
          lastRunAt: fieldOf(counts.lastRunAt),
        },
        needsAttention: attention,
        recent,
        out,
        incoming,
      })
      .from(w)
      .where(eq(w.id, workspaceId))
      .limit(1)
    const row = rows[0]
    if (!row) return null
    return {
      counts: row.counts,
      needsAttention: readJsonArray<WorkspaceAttentionItem>(row.needsAttention),
      recent: readJsonArray<WorkspaceRecentRun>(row.recent),
      shared: {
        out: readJsonArray<{ id: string; name: string }>(row.out),
        in: readJsonArray<WorkspacePageOverview['shared']['in'][number]>(row.incoming),
      },
    }
  }

  /** A workflow's whole page summary: current version, deploys and runs. */
  async workflowSummary(workflowId: string, now: Date): Promise<WorkflowPageSummary | null> {
    const wf = aliasedTable(this.t.workflows, 'wfs')
    const w = aliasedTable(this.t.workspaces, 'wfw')
    const p = aliasedTable(this.t.projects, 'wfp')
    const v = aliasedTable(this.t.workflowVersions, 'wfv')
    const d = aliasedTable(this.t.deployments, 'wfd')
    const c = aliasedTable(this.t.connections, 'wfc')
    const dv = aliasedTable(this.t.workflowVersions, 'wfdv')
    const r = aliasedTable(this.t.workflowRuns, 'wfr')
    const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
    const versionInner = sql`select ${v.id} as id, ${v.version} as version, ${v.locked} as locked, ${v.createdAt} as created_at from ${aliasedFrom(v)} where ${v.workflowId} = ${wf.id} order by ${v.version} desc, ${v.id} desc limit 1`
    const version = this.jsonList(
      [
        ['id', sql`x.id`],
        ['version', sql`x.version`],
        ['locked', sql`x.locked`],
        ['createdAt', sql`x.created_at`],
      ],
      versionInner,
      sql`x.version desc`,
    )
    const deploy = (condition: SQL) => {
      const inner = sql`select ${d.id} as id, ${d.connectionId} as connection_id, ${c.name} as connection_name, ${d.versionId} as version_id, ${d.versionNumber} as version_number, ${dv.locked} as version_locked, ${d.status} as status, ${d.error} as error, ${d.createdAt} as created_at from ${aliasedFrom(d)} left join ${aliasedFrom(c)} on ${c.id} = ${d.connectionId} and ${c.organizationId} = ${p.organizationId} left join ${aliasedFrom(dv)} on ${dv.id} = ${d.versionId} where ${d.workflowId} = ${wf.id} and ${condition} order by ${d.createdAt} desc, ${d.id} desc limit 1`
      return this.jsonList(
        [
          ['id', sql`x.id`],
          ['connectionId', sql`x.connection_id`],
          ['connectionName', sql`x.connection_name`],
          ['versionId', sql`x.version_id`],
          ['versionNumber', sql`x.version_number`],
          ['versionLocked', sql`x.version_locked`],
          ['status', sql`x.status`],
          ['error', sql`x.error`],
          ['createdAt', sql`x.created_at`],
        ],
        inner,
        sql`x.created_at desc, x.id desc`,
      )
    }
    const currentDeploy = deploy(sql`1 = 1`)
    const lastSuccess = deploy(
      sql`${d.status} = 'success' and ${d.connectionId} is not null and ${c.id} is not null`,
    )
    const counts = {
      all: sql`(select count(*) from ${aliasedFrom(r)} where ${r.workflowId} = ${wf.id} and ${r.createdAt} >= ${since})`,
      succeeded: sql`(select count(*) from ${aliasedFrom(r)} where ${r.workflowId} = ${wf.id} and ${r.createdAt} >= ${since} and ${r.status} = 'complete')`,
      failed: sql`(select count(*) from ${aliasedFrom(r)} where ${r.workflowId} = ${wf.id} and ${r.createdAt} >= ${since} and ${r.status} in ('errored', 'terminated'))`,
    }
    const rows = await this.db
      .select({
        currentVersion: version,
        versionCount: sql`(select count(*) from ${aliasedFrom(v)} where ${v.workflowId} = ${wf.id})`,
        lastSuccessfulDeploy: lastSuccess,
        latestDeploy: currentDeploy,
        deployCount: sql`(select count(*) from ${aliasedFrom(d)} where ${d.workflowId} = ${wf.id})`,
        runAll: counts.all,
        runSucceeded: counts.succeeded,
        runFailed: counts.failed,
        runTotal: sql`(select count(*) from ${aliasedFrom(r)} where ${r.workflowId} = ${wf.id})`,
        byHour: this.fields.runsByHour(w.id, now, wf.id),
      })
      .from(wf)
      .innerJoin(w, eq(w.id, wf.workspaceId))
      .innerJoin(p, eq(p.id, wf.projectId))
      .where(eq(wf.id, workflowId))
      .limit(1)
    const row = rows[0]
    if (!row) return null
    const current =
      readJsonArray<WorkflowPageSummary['currentVersion']>(row.currentVersion)[0] ?? null
    const last = readJsonArray<WorkflowDeploySummary>(row.lastSuccessfulDeploy)[0] ?? null
    const latest = readJsonArray<WorkflowDeploySummary>(row.latestDeploy)[0] ?? null
    const all = Number(row.runAll)
    const succeeded = Number(row.runSucceeded)
    const failed = Number(row.runFailed)
    return {
      currentVersion: current,
      versionCount: Number(row.versionCount),
      lastSuccessfulDeploy: last,
      latestDeploy: latest,
      deployCount: Number(row.deployCount),
      runs: {
        counts: { all, succeeded, failed, running: Math.max(0, all - succeeded - failed) },
        total: Number(row.runTotal),
        byHour: readJsonArray(row.byHour),
      },
    }
  }

  /** Resources' two tab pills: installed nodes and the organization's variables. */
  async resourceCounts(organizationId: string): Promise<ResourceCounts> {
    const o = aliasedTable(this.t.organization, 'rco')
    const i = aliasedTable(this.t.installedNodes, 'rci')
    const v = aliasedTable(this.t.envVars, 'rcv')
    const installedNodes = sql`(select count(*) from ${aliasedFrom(i)} where ${i.organizationId} = ${o.id})`
    const variables = sql`(select count(*) from ${aliasedFrom(v)} where ${v.organizationId} = ${o.id} and ${v.projectId} is null)`
    const rows = await this.db
      .select({ installedNodes, variables })
      .from(o)
      .where(eq(o.id, organizationId))
      .limit(1)
    const row = rows[0]
    return {
      installedNodes: Number(row?.installedNodes ?? 0),
      variables: Number(row?.variables ?? 0),
    }
  }
}
