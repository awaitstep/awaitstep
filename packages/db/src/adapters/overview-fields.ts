import { sql, aliasedTable, getTableName, type SQL } from 'drizzle-orm'
import { aliasedFrom, type Dialect, jsonArrayOf, jsonArrayOfValues } from './json-array.js'
import { RoleFields, type AccessTables } from './role-fields.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTable = any

/** The tables the dashboard's overviews read across. */
export interface OverviewTables extends AccessTables {
  workflows: AnyTable
  workflowRuns: AnyTable
  deployments: AnyTable
  workflowVersions: AnyTable
}

/** A run that finished badly: what "failing" and "failed" mean everywhere. */
export const FAILED_RUN_STATUSES = ['errored', 'terminated'] as const
export const TERMINAL_RUN_STATUSES = ['complete', ...FAILED_RUN_STATUSES] as const

const FAILED_LIST = sql.raw(FAILED_RUN_STATUSES.map((s) => `'${s}'`).join(', '))
const ORG_ADMINS = sql.raw(`('owner', 'admin')`)
const HOUR_MS = 60 * 60 * 1000

/** Whose view a list or count is cut to: hidden workspaces add nothing for them. */
export interface Viewer {
  userId: string
  organizationId: SQL | unknown
}

/**
 * The scalar subqueries that decorate an org, project or workspace row with
 * its counts and lists, so a scope lookup or a listing stays one statement.
 * Every table inside is aliased: drizzle only qualifies a column with its
 * table when the table is an alias, and these are correlated subqueries.
 */
export class OverviewFields {
  readonly roles: RoleFields

  constructor(
    private t: OverviewTables,
    private dialect: Dialect,
  ) {
    this.roles = new RoleFields(t)
  }

  /** The organization's members with their roles, by name. */
  members(organizationId: SQL | unknown): SQL {
    const m = aliasedTable(this.t.member, 'om')
    const u = aliasedTable(this.t.user, 'ou')
    const list = jsonArrayOf(
      this.dialect,
      { id: u.id, name: u.name, email: u.email, image: u.image, role: m.role },
      sql`${u.name}, ${u.id}`,
    )
    return sql`(select ${list} from ${aliasedFrom(m)} inner join ${aliasedFrom(u)} on ${u.id} = ${m.userId} where ${m.organizationId} = ${organizationId})`
  }

  /**
   * Who can open a workspace of the project that the viewer can open: org
   * owners and admins, the project's members, and people granted one of
   * those workspaces — with their org role, by name.
   */
  projectPeople(projectId: SQL | unknown, viewer: Viewer): SQL {
    const m = aliasedTable(this.t.member, 'pm_m')
    const u = aliasedTable(this.t.user, 'pm_u')
    const wm = aliasedTable(this.t.workspaceMembers, 'pm_wm')
    const w = aliasedTable(this.t.workspaces, 'pm_w')
    const list = jsonArrayOf(
      this.dialect,
      { id: u.id, name: u.name, email: u.email, image: u.image, role: m.role },
      sql`${u.name}, ${u.id}`,
    )
    const inVisibleWorkspace = sql`exists (select 1 from ${aliasedFrom(wm)} inner join ${aliasedFrom(w)} on ${w.id} = ${wm.workspaceId} where ${w.projectId} = ${projectId} and ${wm.userId} = ${u.id} and ${this.roles.workspaceRoleOf(viewer.userId, { organizationId: viewer.organizationId, projectId, workspaceId: w.id })} is not null)`
    return sql`(select ${list} from ${aliasedFrom(m)} inner join ${aliasedFrom(u)} on ${u.id} = ${m.userId} where ${m.organizationId} = ${viewer.organizationId} and (${m.role} in ${ORG_ADMINS} or ${this.roles.projectGrantOf(u.id, projectId)} is not null or ${inVisibleWorkspace}))`
  }

  /**
   * Everyone who can open the workspace, with the rows their role comes from
   * and when they were last active, by name.
   */
  workspacePeople(
    workspaceId: SQL | unknown,
    projectId: SQL | unknown,
    organizationId: SQL | unknown,
  ): SQL {
    const m = aliasedTable(this.t.member, 'wp_m')
    const u = aliasedTable(this.t.user, 'wp_u')
    const s = aliasedTable(this.t.session, 'wp_s')
    const projectGrant = this.roles.projectGrantOf(u.id, projectId)
    const workspaceGrant = this.roles.workspaceGrantOf(u.id, workspaceId)
    const list = jsonArrayOf(
      this.dialect,
      {
        id: u.id,
        name: u.name,
        email: u.email,
        image: u.image,
        orgRole: m.role,
        projectGrant,
        workspaceGrant,
        lastActiveAt: sql`(select max(${s.updatedAt}) from ${aliasedFrom(s)} where ${s.userId} = ${u.id})`,
      },
      sql`${u.name}, ${u.id}`,
    )
    return sql`(select ${list} from ${aliasedFrom(m)} inner join ${aliasedFrom(u)} on ${u.id} = ${m.userId} where ${m.organizationId} = ${organizationId} and (${m.role} in ${ORG_ADMINS} or ${projectGrant} is not null or ${workspaceGrant} is not null))`
  }

  projectCount(organizationId: SQL | unknown): SQL<number> {
    const p = aliasedTable(this.t.projects, 'cp')
    return sql<number>`(select count(*) from ${aliasedFrom(p)} where ${p.organizationId} = ${organizationId})`.mapWith(
      Number,
    )
  }

  memberCount(organizationId: SQL | unknown): SQL<number> {
    const m = aliasedTable(this.t.member, 'cm')
    return sql<number>`(select count(*) from ${aliasedFrom(m)} where ${m.organizationId} = ${organizationId})`.mapWith(
      Number,
    )
  }

  /** A project's workspaces as chips, oldest first; only the viewer's when one is given. */
  workspaceChips(projectId: SQL | unknown, viewer?: Viewer): SQL {
    const w = aliasedTable(this.t.workspaces, 'cw')
    const list = jsonArrayOf(
      this.dialect,
      { id: w.id, slug: w.slug, name: w.name, colour: w.colour },
      sql`${w.createdAt}, ${w.id}`,
    )
    const visible = viewer
      ? sql` and ${this.roles.workspaceRoleOf(viewer.userId, { organizationId: viewer.organizationId, projectId, workspaceId: w.id })} is not null`
      : sql``
    return sql`(select ${list} from ${aliasedFrom(w)} where ${w.projectId} = ${projectId}${visible})`
  }

  /**
   * Names of the project's workspaces locked on their own, oldest first —
   * every one, seen or not: deleting the project waits for all of them. Only
   * a project admin hears the names (in the delete reason), and project
   * admins open every workspace.
   */
  lockedWorkspaceNames(projectId: SQL | unknown): SQL {
    const w = aliasedTable(this.t.workspaces, 'lw')
    const list = jsonArrayOfValues(this.dialect, sql`${w.name}`, sql`${w.createdAt}, ${w.id}`)
    return sql`(select ${list} from ${aliasedFrom(w)} where ${w.projectId} = ${projectId} and ${w.lockedAt} is not null)`
  }

  /**
   * A lock's setter is named only while they are in the row's organization:
   * someone who left reads as "Someone", as the lock's own record says.
   * Spelled out with its table, so it binds in a statement without joins too.
   */
  inOrganization(userId: SQL | unknown, organizationId: SQL | unknown): SQL {
    const m = this.t.member
    const col = (name: string) => sql`${sql.identifier('lock_member')}.${sql.identifier(name)}`
    return sql`exists (select 1 from ${sql.identifier(getTableName(m))} ${sql.identifier('lock_member')} where ${col(m.userId.name)} = ${userId} and ${col(m.organizationId.name)} = ${organizationId})`
  }

  workspaceCount(projectId: SQL | unknown): SQL<number> {
    const w = aliasedTable(this.t.workspaces, 'nw')
    return sql<number>`(select count(*) from ${aliasedFrom(w)} where ${w.projectId} = ${projectId})`.mapWith(
      Number,
    )
  }

  /** The project's health over the workspaces the viewer can open. */
  projectHealth(projectId: SQL | unknown, viewer?: Viewer) {
    const wf = aliasedTable(this.t.workflows, 'hw')
    const r = aliasedTable(this.t.workflowRuns, 'hr')
    const hv = aliasedTable(this.t.workspaces, 'hv')
    const visible = viewer
      ? sql` and exists (select 1 from ${aliasedFrom(hv)} where ${hv.id} = ${wf.workspaceId} and ${this.roles.workspaceRoleOf(viewer.userId, { organizationId: viewer.organizationId, projectId, workspaceId: hv.id })} is not null)`
      : sql``
    const inProject = sql`${wf.projectId} = ${projectId}${visible}`
    return {
      workflows: this.countWorkflows(wf, sql`${inProject} and ${wf.kind} = 'workflow'`),
      deployed: this.countWorkflows(
        wf,
        sql`${inProject} and ${wf.kind} = 'workflow' and ${this.liveSomewhere(wf)}`,
      ),
      failing: this.countWorkflows(
        wf,
        sql`${inProject} and ${this.latestRunStatus(wf)} in (${FAILED_LIST})`,
      ),
      lastRunAt: this.lastRunAt(r, wf, inProject),
    }
  }

  /**
   * As `projectHealth`, over the whole organization: failing workflows and
   * the last run, across the workspaces the viewer can open there.
   */
  orgHealth(viewer: Viewer) {
    const wf = aliasedTable(this.t.workflows, 'ow')
    const r = aliasedTable(this.t.workflowRuns, 'orr')
    const p = aliasedTable(this.t.projects, 'op')
    const inOrg = sql`${wf.projectId} in (select ${p.id} from ${aliasedFrom(p)} where ${p.organizationId} = ${viewer.organizationId}) and ${this.roles.workflowVisible(viewer.userId, wf.workspaceId)}`
    return {
      failing: this.countWorkflows(
        wf,
        sql`${inOrg} and ${this.latestRunStatus(wf)} in (${FAILED_LIST})`,
      ),
      lastRunAt: this.lastRunAt(r, wf, inOrg),
    }
  }

  /**
   * The viewer's own grants in the organization, oldest first: project-wide
   * roles, and single workspaces with the role they work as there (a project
   * member's Viewer grant still works as Editor). `applies` is false for an
   * org owner or admin, whose role already covers everything.
   */
  orgGrants(viewer: Viewer, applies: SQL) {
    const pm = aliasedTable(this.t.projectMembers, 'gpm')
    const gp = aliasedTable(this.t.projects, 'gp')
    const wm = aliasedTable(this.t.workspaceMembers, 'gwm')
    const gw = aliasedTable(this.t.workspaces, 'gw')
    const wp = aliasedTable(this.t.projects, 'gwp')
    const projects = jsonArrayOf(
      this.dialect,
      { name: gp.name, role: pm.role },
      sql`${pm.createdAt}, ${gp.name}`,
    )
    const workspaces = jsonArrayOf(
      this.dialect,
      {
        name: gw.name,
        projectName: wp.name,
        role: this.roles.workspaceRoleOf(viewer.userId, {
          organizationId: viewer.organizationId,
          projectId: wp.id,
          workspaceId: gw.id,
        }),
      },
      sql`${wm.createdAt}, ${gw.name}`,
    )
    return {
      projects: sql`(select ${projects} from ${aliasedFrom(pm)} inner join ${aliasedFrom(gp)} on ${gp.id} = ${pm.projectId} where ${applies} and ${pm.userId} = ${viewer.userId} and ${gp.organizationId} = ${viewer.organizationId})`,
      workspaces: sql`(select ${workspaces} from ${aliasedFrom(wm)} inner join ${aliasedFrom(gw)} on ${gw.id} = ${wm.workspaceId} inner join ${aliasedFrom(wp)} on ${wp.id} = ${gw.projectId} where ${applies} and ${wm.userId} = ${viewer.userId} and ${wp.organizationId} = ${viewer.organizationId})`,
    }
  }

  /** `since` bounds the 24-hour run count; the caller computes it once per statement. */
  workspaceCounts(workspaceId: SQL | unknown, since: string) {
    const wf = aliasedTable(this.t.workflows, 'kw')
    const r = aliasedTable(this.t.workflowRuns, 'kr')
    const inWorkspace = sql`${wf.workspaceId} = ${workspaceId}`
    return {
      workflows: this.countWorkflows(wf, sql`${inWorkspace} and ${wf.kind} = 'workflow'`),
      deployed: this.countWorkflows(
        wf,
        sql`${inWorkspace} and ${wf.kind} = 'workflow' and ${this.liveSomewhere(wf)}`,
      ),
      functions: this.countWorkflows(wf, sql`${inWorkspace} and ${wf.kind} = 'script'`),
      sharedOut: this.countWorkflows(wf, sql`${inWorkspace} and ${wf.sharedAt} is not null`),
      failing: this.countWorkflows(
        wf,
        sql`${inWorkspace} and ${this.latestRunStatus(wf)} in (${FAILED_LIST})`,
      ),
      runs24h:
        sql<number>`(select count(*) from ${aliasedFrom(r)} inner join ${aliasedFrom(wf)} on ${wf.id} = ${r.workflowId} where ${inWorkspace} and ${r.createdAt} >= ${since})`.mapWith(
          Number,
        ),
      lastRunAt: this.lastRunAt(r, wf, inWorkspace),
    }
  }

  /**
   * The workspace's runs in each of the 24 hours up to `now`, oldest first:
   * how many started, and how many of those finished well or failed. Every
   * hour is present, an empty one as zeros. The window is `runs24h`'s
   * (`since` onwards), so the bars always add up to the tile's count: a run
   * exactly at `since` goes in the oldest bar, one stamped after `now` (clock
   * skew) in the newest. One grouped pass over the day's runs.
   */
  runsByHour(workspaceId: SQL | unknown, now: Date, workflowId?: string): SQL {
    const wf = aliasedTable(this.t.workflows, 'hw')
    const r = aliasedTable(this.t.workflowRuns, 'hr')
    const until = now.toISOString()
    const since = new Date(now.getTime() - 24 * HOUR_MS).toISOString()
    const pg = this.dialect === 'pg'
    const hoursAgo = pg
      ? sql`greatest(0, least(23, floor(extract(epoch from (${until}::timestamp - day.created_at)) / 3600)))`
      : // julianday is a float day: rounded to the millisecond first, so a run
        // exactly on the hour isn't 9.999… hours back.
        sql`max(0, min(23, cast(round((julianday(${until}) - julianday(day.created_at)) * 86400000) as integer) / 3600000))`
    // One workflow's, on its own page; else the whole workspace's.
    const oneWorkflow = workflowId ? sql` and ${wf.id} = ${workflowId}` : sql``
    const day = sql`(select ${r.status} as status, ${r.createdAt} as created_at from ${aliasedFrom(r)} inner join ${aliasedFrom(wf)} on ${wf.id} = ${r.workflowId} where ${wf.workspaceId} = ${workspaceId}${oneWorkflow} and ${r.createdAt} >= ${since}) day`
    const count = (status: SQL) =>
      sql`coalesce(sum(case when day.status ${status} then 1 else 0 end), 0)`
    const hours = sql.raw(
      `(with recursive h(i) as (select 0 union all select i + 1 from h where i < 23) select i from h) hrs`,
    )
    const buckets = sql`(select hrs.i as i, count(day.status) as runs, ${count(sql`= 'complete'`)} as complete, ${count(sql`in (${FAILED_LIST})`)} as failed from ${hours} left join ${day} on ${hoursAgo} = 23 - hrs.i group by hrs.i) b`
    const row = sql`${sql.raw(pg ? 'json_build_object' : 'json_object')}('runs', b.runs, 'complete', b.complete, 'failed', b.failed)`
    return sql`(select ${jsonArrayOfValues(this.dialect, row, sql`b.i`)} from ${buckets})`
  }

  /**
   * The workflow is live on some account: a successful deploy not taken down,
   * on an account that still exists (`liveOnItsAccount`'s rule).
   */
  liveSomewhere(wf: AnyTable): SQL {
    const d = aliasedTable(this.t.deployments, 'ld')
    return sql`exists (select 1 from ${aliasedFrom(d)} where ${d.workflowId} = ${wf.id} and ${d.status} = 'success' and ${d.connectionId} is not null)`
  }

  /**
   * The version number of the workflow's newest live deploy, or null; it
   * outlives the version. The newest successful row on an existing account is
   * always live on it.
   */
  latestDeployedVersion(wf: AnyTable): SQL<number | null> {
    const d = aliasedTable(this.t.deployments, 'vd')
    return sql<
      number | null
    >`(select ${d.versionNumber} from ${aliasedFrom(d)} where ${d.workflowId} = ${wf.id} and ${d.status} = 'success' and ${d.connectionId} is not null order by ${d.createdAt} desc, ${d.id} desc limit 1)`
  }

  /** The status of a workflow's latest run, or null. */
  latestRunStatus(wf: AnyTable): SQL {
    const r = aliasedTable(this.t.workflowRuns, 'lr')
    return sql`(select ${r.status} from ${aliasedFrom(r)} where ${r.workflowId} = ${wf.id} order by ${r.createdAt} desc limit 1)`
  }

  private countWorkflows(wf: AnyTable, condition: SQL): SQL<number> {
    return sql<number>`(select count(*) from ${aliasedFrom(wf)} where ${condition})`.mapWith(Number)
  }

  private lastRunAt(r: AnyTable, wf: AnyTable, condition: SQL): SQL<string | null> {
    return (
      sql<
        string | null
      >`(select max(${r.createdAt}) from ${aliasedFrom(r)} inner join ${aliasedFrom(wf)} on ${wf.id} = ${r.workflowId} where ${condition})`
        // A raw subquery skips the column's decoder; pg would return its own text format.
        .mapWith(this.t.workflowRuns.createdAt)
    )
  }
}
