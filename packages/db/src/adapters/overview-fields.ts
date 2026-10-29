import { sql, aliasedTable, type SQL } from 'drizzle-orm'
import { aliasedFrom, type Dialect, jsonArrayOf } from './json-array.js'
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
        sql`${inProject} and ${wf.kind} = 'workflow' and ${this.latestDeployStatus(wf)} = 'success'`,
      ),
      failing: this.countWorkflows(
        wf,
        sql`${inProject} and ${this.latestRunStatus(wf)} in (${FAILED_LIST})`,
      ),
      lastRunAt: this.lastRunAt(r, wf, inProject),
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
        sql`${inWorkspace} and ${wf.kind} = 'workflow' and ${this.latestDeployStatus(wf)} = 'success'`,
      ),
      functions: this.countWorkflows(wf, sql`${inWorkspace} and ${wf.kind} = 'script'`),
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

  /** The status of a workflow's latest deployment, or null. */
  latestDeployStatus(wf: AnyTable): SQL {
    const d = aliasedTable(this.t.deployments, 'ld')
    return sql`(select ${d.status} from ${aliasedFrom(d)} where ${d.workflowId} = ${wf.id} order by ${d.createdAt} desc limit 1)`
  }

  /** The version number a workflow's latest deployment put live, or null. */
  latestDeployedVersion(wf: AnyTable): SQL<number | null> {
    const d = aliasedTable(this.t.deployments, 'vd')
    const v = aliasedTable(this.t.workflowVersions, 'vv')
    return sql<
      number | null
    >`(select ${v.version} from ${aliasedFrom(v)} where ${v.id} = (select ${d.versionId} from ${aliasedFrom(d)} where ${d.workflowId} = ${wf.id} order by ${d.createdAt} desc limit 1))`
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
