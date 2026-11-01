import {
  and,
  asc,
  eq,
  getTableColumns,
  inArray,
  isNull,
  ne,
  notInArray,
  sql,
  aliasedTable,
  type SQL,
  type SQLWrapper,
} from 'drizzle-orm'
import type {
  AccessGrantData,
  GrantRows,
  InOrgCheck,
  OrgMemberPlace,
  OrgMemberRow,
  PersonAccessRows,
  NamedProjectMember,
  ProjectGrant,
  ProjectGrantData,
  ProjectGrantRows,
  ProjectMemberRow,
  WorkspaceChip,
  WorkspaceGrant,
  WorkspaceGrantData,
  NamedWorkspaceMember,
  WorkspacePersonRow,
} from '../types.js'
import { writeChanging } from './projects.js'
import { atomically, atomicallyReturning } from './atomic.js'
import { boundFields } from './insert-where.js'
import {
  aliasedFrom,
  idList,
  jsonArrayOf,
  nestedJson,
  readJsonArray,
  type Dialect,
} from './json-array.js'
import { OverviewFields, type OverviewTables } from './overview-fields.js'
import { readPeople } from './people.js'

const ORG_ADMINS = sql.raw(`('owner', 'admin')`)

/** The overview tables, and the invitations a removal or demotion cancels and a project move trims. */
export interface AccessAdapterTables extends OverviewTables {
  invitation: unknown
  invitationPlaces: unknown
  /** A project's variables carry its organization; a move re-homes them (B4). */
  envVars: unknown
  /** A project's own accounts move with it; the old organization's shared ones stay behind. */
  connections?: unknown
  connectionProjects?: unknown
  projectConnections?: unknown
  workspaceConnections?: unknown
}

/** The caller's own standing, for the rules a statement enforces about owners. */
export interface Caller {
  callerIsOwner: boolean
}

/**
 * Who can work where, below the organization: the people lists each level
 * shows, the access editor's read and write, and a workspace's own grants.
 * Reads are one statement; a write with more than one row is one
 * `atomically()` unit, and a write that must refuse something does so in
 * its own `WHERE`, so the check and the change cannot be split. A unit
 * reports nothing back (the drivers' batch results differ); the caller
 * reads what it needs to know afterwards, and only when it needs to.
 */
export class AccessAdapter {
  private fields: OverviewFields

  constructor(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private db: any,
    private t: AccessAdapterTables,
    private dialect: Dialect,
  ) {
    this.fields = new OverviewFields(t, dialect)
  }

  /** "Someone else owns the organization too": the guard on changing or removing an owner. */
  private anotherOwner(organizationId: string, userId: string): SQL {
    const other = aliasedTable(this.t.member, 'other_owner')
    return sql`exists (select 1 from ${aliasedFrom(other)} where ${other.organizationId} = ${organizationId} and ${other.role} = 'owner' and ${other.userId} <> ${userId})`
  }

  /** The projects of the organization, as `member`'s subquery would see them. */
  private orgProjects(organizationId: string): SQL {
    const p = aliasedTable(this.t.projects, 'op')
    return sql`(select ${p.id} from ${aliasedFrom(p)} where ${p.organizationId} = ${organizationId})`
  }

  private orgWorkspaces(organizationId: string): SQL {
    const w = aliasedTable(this.t.workspaces, 'ow')
    const p = aliasedTable(this.t.projects, 'op')
    return sql`(select ${w.id} from ${aliasedFrom(w)} inner join ${aliasedFrom(p)} on ${p.id} = ${w.projectId} where ${p.organizationId} = ${organizationId})`
  }

  /**
   * Org Settings → Members: everyone in the organization and, for plain
   * members, where they can work — in projects the viewer can open, naming
   * and counting only the workspaces the viewer can open. A workspace row
   * in a project someone holds project-wide adds nothing and is left out.
   */
  async listOrgMembers(organizationId: string, viewerId: string): Promise<OrgMemberRow[]> {
    const m = aliasedTable(this.t.member, 'm')
    const u = aliasedTable(this.t.user, 'u')
    const pm = aliasedTable(this.t.projectMembers, 'lpm')
    const wide = aliasedTable(this.t.projectMembers, 'lwide')
    const wm = aliasedTable(this.t.workspaceMembers, 'lwm')
    const p = aliasedTable(this.t.projects, 'lp')
    const w = aliasedTable(this.t.workspaces, 'lw')
    const cw = aliasedTable(this.t.workspaces, 'lcw')
    const roles = this.fields.roles
    const viewerOpens = (workspaceId: unknown) =>
      sql`${roles.workspaceRoleOf(viewerId, { organizationId: p.organizationId, projectId: p.id, workspaceId })} is not null`
    const workspaceCount = sql`(select count(*) from ${aliasedFrom(cw)} where ${cw.projectId} = ${p.id} and ${viewerOpens(cw.id)})`
    const visible = roles.projectVisible(viewerId, {
      organizationId: p.organizationId,
      projectId: p.id,
    })
    const noProjectRow = sql`not exists (select 1 from ${aliasedFrom(wide)} where ${wide.projectId} = ${p.id} and ${wide.userId} = ${u.id})`
    // Project-wide rows, then workspace rows, as one list; `json_object`'s
    // keys are what OrgMemberPlace reads.
    const projectPlaces = sql`select ${p.id} as project_id, ${p.name} as project_name, ${workspaceCount} as workspace_count, null as workspace_id, null as workspace_name, ${pm.role} as role, ${p.name} as sort_name, '' as sort_workspace from ${aliasedFrom(pm)} inner join ${aliasedFrom(p)} on ${p.id} = ${pm.projectId} where ${pm.userId} = ${u.id} and ${p.organizationId} = ${m.organizationId} and ${visible}`
    const workspacePlaces = sql`select ${p.id}, ${p.name}, ${workspaceCount}, ${w.id}, ${w.name}, ${wm.role}, ${p.name}, ${w.name} from ${aliasedFrom(wm)} inner join ${aliasedFrom(w)} on ${w.id} = ${wm.workspaceId} inner join ${aliasedFrom(p)} on ${p.id} = ${w.projectId} where ${wm.userId} = ${u.id} and ${p.organizationId} = ${m.organizationId} and ${viewerOpens(w.id)} and ${noProjectRow}`
    const place = jsonArrayOf(
      this.dialect,
      {
        projectId: sql.raw('pl.project_id'),
        projectName: sql.raw('pl.project_name'),
        workspaceCount: sql.raw('pl.workspace_count'),
        workspaceId: sql.raw('pl.workspace_id'),
        workspaceName: sql.raw('pl.workspace_name'),
        role: sql.raw('pl.role'),
      },
      sql.raw('pl.sort_name, pl.sort_workspace'),
    )
    const places = sql`(select ${place} from (${projectPlaces} union all ${workspacePlaces}) as pl)`
    const rows = await this.db
      .select({
        id: u.id,
        name: u.name,
        email: u.email,
        image: u.image,
        role: m.role,
        joinedAt: m.createdAt,
        places,
      })
      .from(m)
      .innerJoin(u, eq(u.id, m.userId))
      .where(eq(m.organizationId, organizationId))
      .orderBy(asc(u.name), asc(u.id))
    return rows.map((row: OrgMemberRow & { places: unknown }) => ({
      ...row,
      places: readJsonArray<OrgMemberPlace>(row.places).map((pl) => ({
        ...pl,
        workspaceCount: Number(pl.workspaceCount),
      })),
    }))
  }

  /** What the access editor loads for one person: the org's projects and the person's rows. */
  async getPersonAccess(organizationId: string, userId: string): Promise<PersonAccessRows | null> {
    const m = aliasedTable(this.t.member, 'm')
    const u = aliasedTable(this.t.user, 'u')
    const p = aliasedTable(this.t.projects, 'ap')
    const w = aliasedTable(this.t.workspaces, 'aw')
    const pm = aliasedTable(this.t.projectMembers, 'apm')
    const wm = aliasedTable(this.t.workspaceMembers, 'awm')
    const chips = jsonArrayOf(
      this.dialect,
      { id: w.id, slug: w.slug, name: w.name, colour: w.colour },
      sql`${w.createdAt}, ${w.id}`,
    )
    const projects = jsonArrayOf(
      this.dialect,
      {
        id: p.id,
        name: p.name,
        workspaces: nestedJson(
          this.dialect,
          sql`(select ${chips} from ${aliasedFrom(w)} where ${w.projectId} = ${p.id})`,
        ),
      },
      sql`${p.name}, ${p.id}`,
    )
    const projectGrants = jsonArrayOf(this.dialect, { projectId: pm.projectId, role: pm.role })
    const workspaceGrants = jsonArrayOf(this.dialect, {
      workspaceId: wm.workspaceId,
      role: wm.role,
    })
    const rows = await this.db
      .select({
        id: u.id,
        name: u.name,
        email: u.email,
        image: u.image,
        role: m.role,
        joinedAt: m.createdAt,
        projects: sql`(select ${projects} from ${aliasedFrom(p)} where ${p.organizationId} = ${m.organizationId})`,
        projectGrants: sql`(select ${projectGrants} from ${aliasedFrom(pm)} where ${pm.userId} = ${u.id} and ${pm.projectId} in ${this.orgProjects(organizationId)})`,
        workspaceGrants: sql`(select ${workspaceGrants} from ${aliasedFrom(wm)} where ${wm.userId} = ${u.id} and ${wm.workspaceId} in ${this.orgWorkspaces(organizationId)})`,
      })
      .from(m)
      .innerJoin(u, eq(u.id, m.userId))
      .where(and(eq(m.organizationId, organizationId), eq(m.userId, userId)))
      .limit(1)
    const row = rows[0]
    if (!row) return null
    return {
      person: { id: row.id, name: row.name, email: row.email, image: row.image },
      role: row.role,
      joinedAt: row.joinedAt,
      projects: readJsonArray<{ id: string; name: string; workspaces: WorkspaceChip[] }>(
        row.projects,
      ),
      projectGrants: readJsonArray<{ projectId: string; role: ProjectGrant }>(row.projectGrants),
      workspaceGrants: readJsonArray<{ workspaceId: string; role: WorkspaceGrant }>(
        row.workspaceGrants,
      ),
    }
  }

  /**
   * One read before a write that names ids: how many of the named projects,
   * workspaces and people are the organization's, and one person's role in
   * it — every check a route makes before writing, in one statement.
   */
  async checkInOrganization(
    organizationId: string,
    refs: { userId?: string; userIds?: string[]; projectIds?: string[]; workspaceIds?: string[] },
  ): Promise<InOrgCheck> {
    const p = aliasedTable(this.t.projects, 'cp')
    const w = aliasedTable(this.t.workspaces, 'cw')
    const m = aliasedTable(this.t.member, 'cm')
    const o = this.t.organization
    const none = sql<number>`0`
    const ids = (list: string[]) => idList(this.dialect, list)
    const projects = refs.projectIds?.length
      ? sql<number>`(select count(*) from ${aliasedFrom(p)} where ${p.organizationId} = ${organizationId} and ${p.id} in ${ids(refs.projectIds)})`
      : none
    const workspaces = refs.workspaceIds?.length
      ? sql<number>`(select count(*) from ${aliasedFrom(w)} where ${w.id} in ${ids(refs.workspaceIds)} and ${w.projectId} in ${this.orgProjects(organizationId)})`
      : none
    const users = refs.userIds?.length
      ? sql<number>`(select count(*) from ${aliasedFrom(m)} where ${m.organizationId} = ${organizationId} and ${m.userId} in ${ids(refs.userIds)})`
      : none
    const role = refs.userId
      ? this.fields.roles.orgRoleOf(refs.userId, organizationId)
      : sql<string | null>`null`
    const rows = await this.db
      .select({
        role,
        name: refs.userId ? this.personLabel(refs.userId) : sql<string | null>`null`,
        users: users.mapWith(Number),
        projects: projects.mapWith(Number),
        workspaces: workspaces.mapWith(Number),
      })
      .from(o)
      .where(eq(o.id, organizationId))
      .limit(1)
    return rows[0] ?? { role: null, name: null, users: 0, projects: 0, workspaces: 0 }
  }

  /**
   * How the audit log names a person, by a bound id: their name, or their
   * email when the name is blank (an empty name is stored as '', not null).
   * Safe in a RETURNING list, where columns render bare.
   */
  private personLabel(userId: string): SQL<string | null> {
    const u = aliasedTable(this.t.user, 'pn')
    return sql<
      string | null
    >`(select coalesce(nullif(trim(${u.name}), ''), ${u.email}) from ${aliasedFrom(u)} where ${u.id} = ${userId})`
  }

  /**
   * Sets someone's organization role, refusing to leave the organization
   * without an owner: the check is in the statement. False when no such
   * member, or when they are the only owner and the role is not `owner`.
   */
  async setOrgRole(organizationId: string, userId: string, role: string): Promise<boolean> {
    const m = this.t.member
    const rows = await this.db
      .update(m)
      .set({ role })
      .where(
        and(
          eq(m.organizationId, organizationId),
          eq(m.userId, userId),
          role === 'owner'
            ? undefined
            : sql`(${m.role} <> 'owner' or ${this.anotherOwner(organizationId, userId)})`,
        ),
      )
      .returning({ id: m.id })
    return rows.length > 0
  }

  /**
   * The access editor's save, as one unit: the organization role, then
   * every project and workspace row of theirs in the organization replaced
   * by the editor's. The role change is refused when it would leave the
   * organization without an owner, and then nothing else changes either:
   * every row statement is conditional on the role being the one asked
   * for. The ids were checked against the organization first
   * (`countInOrg`); each insert still joins its project or workspace to the
   * organization, so a row deleted meanwhile is skipped, and a workspace
   * row that counts no higher than what the project gives (`grantCounts`)
   * is skipped too. Only an owner changes an owner: for any other caller
   * the role update also refuses a row that is an owner's by now. Someone
   * who stops running the organization loses the invitations they sent:
   * they are cancelled in the same unit. `orgRoleOf` afterwards says
   * whether the role took.
   */
  async saveAccess(
    organizationId: string,
    userId: string,
    grant: AccessGrantData,
    createdBy: string,
    caller: Caller,
  ): Promise<void> {
    const m = this.t.member
    const pm = this.t.projectMembers
    const wm = this.t.workspaceMembers
    const inv = this.t.invitation as typeof m
    const p = aliasedTable(this.t.projects, 'gp')
    const w = aliasedTable(this.t.workspaces, 'gw')
    const wp = aliasedTable(this.t.projects, 'gwp')
    const roles = this.fields.roles
    const now = new Date().toISOString()
    const roleTook = sql`${roles.orgRoleOf(userId, organizationId)} = ${grant.orgRole}`
    const inherited = roles.inheritedWorkspaceRole(
      roles.orgRoleOf(userId, organizationId),
      roles.projectGrantOf(userId, w.projectId),
    )
    await atomically(this.db, (tx) => [
      tx
        .update(m)
        .set({ role: grant.orgRole })
        .where(
          and(
            eq(m.organizationId, organizationId),
            eq(m.userId, userId),
            caller.callerIsOwner ? undefined : sql`${m.role} <> 'owner'`,
            grant.orgRole === 'owner'
              ? undefined
              : sql`(${m.role} <> 'owner' or ${this.anotherOwner(organizationId, userId)})`,
          ),
        ),
      ...(grant.orgRole === 'member'
        ? [
            tx
              .update(inv)
              .set({ status: 'canceled' })
              .where(
                and(
                  eq(inv.inviterId, userId),
                  eq(inv.organizationId, organizationId),
                  inArray(inv.status, ['pending', 'rejected']),
                  roleTook,
                ),
              ),
          ]
        : []),
      tx
        .delete(pm)
        .where(
          and(
            eq(pm.userId, userId),
            sql`${pm.projectId} in ${this.orgProjects(organizationId)}`,
            roleTook,
          ),
        ),
      tx
        .delete(wm)
        .where(
          and(
            eq(wm.userId, userId),
            sql`${wm.workspaceId} in ${this.orgWorkspaces(organizationId)}`,
            roleTook,
          ),
        ),
      ...grant.projects.map((g) =>
        tx.insert(pm).select(
          tx
            .select({
              ...boundFields(pm, {
                projectId: g.projectId,
                userId,
                role: g.role,
                createdBy,
                createdAt: now,
              }),
              projectId: p.id,
            })
            .from(p)
            .where(and(eq(p.id, g.projectId), eq(p.organizationId, organizationId), roleTook)),
        ),
      ),
      ...grant.workspaces.map((g) =>
        tx.insert(wm).select(
          tx
            .select({
              ...boundFields(wm, {
                workspaceId: g.workspaceId,
                userId,
                role: g.role,
                createdBy,
                createdAt: now,
              }),
              workspaceId: w.id,
            })
            .from(w)
            .innerJoin(wp, eq(wp.id, w.projectId))
            .where(
              and(
                eq(w.id, g.workspaceId),
                eq(wp.organizationId, organizationId),
                roleTook,
                sql`${roles.rank(g.role)} > ${roles.rank(inherited)}`,
              ),
            ),
        ),
      ),
    ])
  }

  /**
   * Removes someone from the organization with every project and workspace
   * row of theirs in it, and cancels the invitations they sent, as one unit
   * — unless they are its only owner, or an owner and the caller is not,
   * when nothing changes (the checks are in the statement; the other
   * statements are conditional on the member row being gone). Answers
   * whether this call removed the member row: false when it was refused or
   * the row was already gone (`orgRoleOf` afterwards says which).
   */
  async removeMember(organizationId: string, userId: string, caller: Caller): Promise<boolean> {
    const m = this.t.member
    const pm = this.t.projectMembers
    const wm = this.t.workspaceMembers
    const inv = this.t.invitation as typeof m
    const still = aliasedTable(this.t.member, 'still')
    const gone = sql`not exists (select 1 from ${aliasedFrom(still)} where ${still.organizationId} = ${organizationId} and ${still.userId} = ${userId})`
    const [removed] = await atomicallyReturning<{ id: string }>(this.db, (tx) => [
      tx
        .delete(m)
        .where(
          and(
            eq(m.organizationId, organizationId),
            eq(m.userId, userId),
            caller.callerIsOwner ? undefined : sql`${m.role} <> 'owner'`,
            sql`(${m.role} <> 'owner' or ${this.anotherOwner(organizationId, userId)})`,
          ),
        )
        .returning({ id: m.id }),
      tx
        .update(inv)
        .set({ status: 'canceled' })
        .where(
          and(
            eq(inv.inviterId, userId),
            eq(inv.organizationId, organizationId),
            inArray(inv.status, ['pending', 'rejected']),
            gone,
          ),
        )
        .returning({ id: inv.id }),
      tx
        .delete(pm)
        .where(
          and(
            eq(pm.userId, userId),
            sql`${pm.projectId} in ${this.orgProjects(organizationId)}`,
            gone,
          ),
        )
        .returning({ userId: pm.userId }),
      tx
        .delete(wm)
        .where(
          and(
            eq(wm.userId, userId),
            sql`${wm.workspaceId} in ${this.orgWorkspaces(organizationId)}`,
            gone,
          ),
        )
        .returning({ userId: wm.userId }),
    ])
    return (removed?.length ?? 0) > 0
  }

  /** Everyone who can open the workspace, with the rows their role comes from, by name. */
  async listWorkspacePeople(workspaceId: string): Promise<WorkspacePersonRow[]> {
    const w = aliasedTable(this.t.workspaces, 'w')
    const p = aliasedTable(this.t.projects, 'p')
    const rows = await this.db
      .select({ people: this.fields.workspacePeople(w.id, p.id, p.organizationId) })
      .from(w)
      .innerJoin(p, eq(p.id, w.projectId))
      .where(eq(w.id, workspaceId))
      .limit(1)
    const row = rows[0]
    return row ? readPeople<WorkspacePersonRow>(row.people, this.dialect) : []
  }

  /**
   * Project settings → Members: everyone who can open any of its workspaces,
   * with their org role, project grant, and grants in the workspaces the
   * viewer can open. Grants in hidden workspaces are left out, so the page
   * never names one.
   */
  async listProjectMembers(projectId: string, viewerId: string): Promise<ProjectMemberRow[]> {
    const p = aliasedTable(this.t.projects, 'p')
    const m = aliasedTable(this.t.member, 'm')
    const u = aliasedTable(this.t.user, 'u')
    const pm = aliasedTable(this.t.projectMembers, 'pm')
    const wm = aliasedTable(this.t.workspaceMembers, 'jwm')
    const w = aliasedTable(this.t.workspaces, 'jw')
    const roles = this.fields.roles
    const visible = roles.workspaceRoleOf(viewerId, {
      organizationId: p.organizationId,
      projectId: p.id,
      workspaceId: w.id,
    })
    const chips = jsonArrayOf(
      this.dialect,
      { id: w.id, slug: w.slug, name: w.name, colour: w.colour, role: wm.role },
      sql`${w.createdAt}, ${w.id}`,
    )
    const workspaces = sql`(select ${chips} from ${aliasedFrom(wm)} inner join ${aliasedFrom(w)} on ${w.id} = ${wm.workspaceId} where ${w.projectId} = ${p.id} and ${wm.userId} = ${u.id} and ${visible} is not null)`
    const rows = await this.db
      .select({
        id: u.id,
        name: u.name,
        email: u.email,
        image: u.image,
        orgRole: m.role,
        projectGrant: pm.role,
        workspaces,
      })
      .from(p)
      .innerJoin(m, eq(m.organizationId, p.organizationId))
      .innerJoin(u, eq(u.id, m.userId))
      .leftJoin(pm, and(eq(pm.projectId, p.id), eq(pm.userId, u.id)))
      .where(
        and(
          eq(p.id, projectId),
          sql`(${m.role} in ${ORG_ADMINS} or ${pm.role} is not null or exists (select 1 from ${aliasedFrom(wm)} inner join ${aliasedFrom(w)} on ${w.id} = ${wm.workspaceId} where ${w.projectId} = ${p.id} and ${wm.userId} = ${u.id} and ${visible} is not null))`,
        ),
      )
      .orderBy(asc(u.name), asc(u.id))
    return rows.map((row: ProjectMemberRow & { workspaces: unknown }) => ({
      ...row,
      workspaces: readJsonArray<WorkspaceChip & { role: WorkspaceGrant }>(row.workspaces),
    }))
  }

  /** The rows behind one person's standing in one workspace: why a grant was refused. */
  async grantRowsOf(workspaceId: string, userId: string): Promise<GrantRows | null> {
    const w = aliasedTable(this.t.workspaces, 'w')
    const p = aliasedTable(this.t.projects, 'p')
    const roles = this.fields.roles
    const rows = await this.db
      .select({
        orgRole: roles.orgRoleOf(userId, p.organizationId),
        projectGrant: roles.projectGrantOf(userId, p.id),
        workspaceGrant: roles.workspaceGrantOf(userId, w.id),
      })
      .from(w)
      .innerJoin(p, eq(p.id, w.projectId))
      .where(eq(w.id, workspaceId))
      .limit(1)
    return rows[0] ?? null
  }

  /**
   * Gives someone in the organization a role in the workspace, if they have
   * none yet and it counts above what the project already gives them. Every
   * condition is in the statement: null when any failed, and `grantRowsOf`
   * says which.
   */
  async addWorkspaceMember(data: WorkspaceGrantData): Promise<NamedWorkspaceMember | null> {
    const wm = this.t.workspaceMembers
    const w = aliasedTable(this.t.workspaces, 'w')
    const p = aliasedTable(this.t.projects, 'p')
    const m = aliasedTable(this.t.member, 'm')
    const roles = this.fields.roles
    const row = {
      workspaceId: data.workspaceId,
      userId: data.userId,
      role: data.role,
      createdBy: data.createdBy,
      createdAt: new Date().toISOString(),
    }
    const inherited = roles.inheritedWorkspaceRole(m.role, roles.projectGrantOf(data.userId, p.id))
    const rows = await this.db
      .insert(wm)
      .select(
        this.db
          .select({ ...boundFields(wm, row), workspaceId: w.id })
          .from(w)
          .innerJoin(p, eq(p.id, w.projectId))
          .innerJoin(m, and(eq(m.organizationId, p.organizationId), eq(m.userId, data.userId)))
          .where(
            and(
              eq(w.id, data.workspaceId),
              sql`${roles.workspaceGrantOf(data.userId, w.id)} is null`,
              sql`${roles.rank(data.role)} > ${roles.rank(inherited)}`,
            ),
          ),
      )
      .returning({ ...getTableColumns(wm), personName: this.personLabel(data.userId) })
    return (rows[0] as NamedWorkspaceMember | undefined) ?? null
  }

  /**
   * Gives someone in the organization a project-wide role, if they hold no
   * project grant yet, no grant in any of its workspaces (the project role
   * would sit over them and they'd quietly keep the person in when it goes;
   * those are changed from Edit access), and aren't an org owner or admin
   * (who already reach every project). Every condition is in the statement:
   * null when any failed, and `projectGrantRows` says which.
   */
  async addProjectMember(data: ProjectGrantData): Promise<NamedProjectMember | null> {
    const pm = this.t.projectMembers
    const p = aliasedTable(this.t.projects, 'p')
    const m = aliasedTable(this.t.member, 'm')
    const row = {
      projectId: data.projectId,
      userId: data.userId,
      role: data.role,
      createdBy: data.createdBy,
      createdAt: new Date().toISOString(),
    }
    const rows = await this.db
      .insert(pm)
      .select(
        this.db
          .select({ ...boundFields(pm, row), projectId: p.id })
          .from(p)
          .innerJoin(m, and(eq(m.organizationId, p.organizationId), eq(m.userId, data.userId)))
          .where(
            and(
              eq(p.id, data.projectId),
              notInArray(m.role, ['owner', 'admin']),
              sql`${this.fields.roles.projectGrantOf(data.userId, p.id)} is null`,
              sql`not ${this.fields.roles.hasWorkspaceGrantIn(data.userId, p.id)}`,
            ),
          ),
      )
      .returning({ ...getTableColumns(pm), personName: this.personLabel(data.userId) })
    return (rows[0] as NamedProjectMember | undefined) ?? null
  }

  /**
   * Gives someone in the organization one role in several of a project's
   * workspaces, in one statement: only when every id named is the project's
   * workspace (else nothing), then each one where they hold no grant yet and
   * the role counts above what the project gives them. The grants written,
   * with each workspace's name; empty when none.
   */
  async addWorkspaceGrants(data: {
    projectId: string
    workspaceIds: string[]
    userId: string
    role: WorkspaceGrant
    createdBy: string
  }): Promise<(NamedWorkspaceMember & { workspaceName: string })[]> {
    if (data.workspaceIds.length === 0) return []
    const wm = this.t.workspaceMembers
    const w = aliasedTable(this.t.workspaces, 'w')
    const p = aliasedTable(this.t.projects, 'p')
    const m = aliasedTable(this.t.member, 'm')
    const named = aliasedTable(this.t.workspaces, 'nw')
    const all = aliasedTable(this.t.workspaces, 'aw')
    const ids = [...new Set(data.workspaceIds)]
    const roles = this.fields.roles
    const row = {
      workspaceId: '',
      userId: data.userId,
      role: data.role,
      createdBy: data.createdBy,
      createdAt: new Date().toISOString(),
    }
    const inherited = roles.inheritedWorkspaceRole(m.role, roles.projectGrantOf(data.userId, p.id))
    const rows = await this.db
      .insert(wm)
      .select(
        this.db
          .select({ ...boundFields(wm, row), workspaceId: w.id })
          .from(w)
          .innerJoin(p, eq(p.id, w.projectId))
          .innerJoin(m, and(eq(m.organizationId, p.organizationId), eq(m.userId, data.userId)))
          .where(
            and(
              eq(p.id, data.projectId),
              sql`${w.id} in ${idList(this.dialect, ids)}`,
              sql`(select count(*) from ${aliasedFrom(all)} where ${all.projectId} = ${p.id} and ${all.id} in ${idList(this.dialect, ids)}) = ${ids.length}`,
              sql`${roles.workspaceGrantOf(data.userId, w.id)} is null`,
              sql`${roles.rank(data.role)} > ${roles.rank(inherited)}`,
            ),
          ),
      )
      .returning({
        ...getTableColumns(wm),
        personName: this.personLabel(data.userId),
        workspaceName: sql<string>`(select ${named.name} from ${aliasedFrom(named)} where ${named.id} = ${wm.workspaceId})`,
      })
    return rows as (NamedWorkspaceMember & { workspaceName: string })[]
  }

  /**
   * Why a project add was refused: their org role, project grant, whether
   * they hold any of its workspaces, and how many of `workspaceIds` are the
   * project's. Null when the project doesn't exist.
   */
  async projectGrantRows(
    projectId: string,
    userId: string,
    workspaceIds: string[] = [],
  ): Promise<ProjectGrantRows | null> {
    const p = aliasedTable(this.t.projects, 'p')
    const o = aliasedTable(this.t.organization, 'o')
    const cw = aliasedTable(this.t.workspaces, 'cw')
    const ids = [...new Set(workspaceIds)]
    const roles = this.fields.roles
    // The join keeps the statement multi-table: drizzle leaves a column bare
    // in a single-table select, which the subqueries would read as their own.
    const rows = await this.db
      .select({
        orgRole: roles.orgRoleOf(userId, o.id),
        projectGrant: roles.projectGrantOf(userId, p.id),
        workspaceGrants:
          sql<boolean>`case when ${roles.hasWorkspaceGrantIn(userId, p.id)} then 1 else 0 end`.mapWith(
            (v) => Number(v) === 1,
          ),
        workspacesInProject: (ids.length
          ? sql<number>`(select count(*) from ${aliasedFrom(cw)} where ${cw.projectId} = ${p.id} and ${cw.id} in ${idList(this.dialect, ids)})`
          : sql<number>`0`
        ).mapWith(Number),
      })
      .from(p)
      .innerJoin(o, eq(o.id, p.organizationId))
      .where(eq(p.id, projectId))
      .limit(1)
    return rows[0] ?? null
  }

  /**
   * Changes a grant's role, if the new one counts above what the project
   * gives. Null otherwise. `changed` is false when it already had that role.
   */
  async setWorkspaceGrant(
    workspaceId: string,
    userId: string,
    role: WorkspaceGrant,
  ): Promise<(NamedWorkspaceMember & { changed: boolean }) | null> {
    const wm = this.t.workspaceMembers
    const w = aliasedTable(this.t.workspaces, 'sw')
    const p = aliasedTable(this.t.projects, 'sp')
    const roles = this.fields.roles
    const projectId = sql`(select ${w.projectId} from ${aliasedFrom(w)} where ${w.id} = ${workspaceId})`
    const organizationId = sql`(select ${p.organizationId} from ${aliasedFrom(w)} inner join ${aliasedFrom(p)} on ${p.id} = ${w.projectId} where ${w.id} = ${workspaceId})`
    const inherited = roles.inheritedWorkspaceRole(
      roles.orgRoleOf(userId, organizationId),
      roles.projectGrantOf(userId, projectId),
    )
    return writeChanging<NamedWorkspaceMember>((match) =>
      this.db
        .update(wm)
        .set({ role })
        .where(
          and(
            eq(wm.workspaceId, workspaceId),
            eq(wm.userId, userId),
            sql`${roles.rank(role)} > ${roles.rank(inherited)}`,
            match === 'changing' ? ne(wm.role, role) : eq(wm.role, role),
          ),
        )
        .returning({ ...getTableColumns(wm), personName: this.personLabel(userId) }),
    )
  }

  /** The removed grant with the person's name; null when there was none. */
  async removeWorkspaceGrant(
    workspaceId: string,
    userId: string,
  ): Promise<{ role: string; personName: string | null } | null> {
    const wm = this.t.workspaceMembers
    const rows = await this.db
      .delete(wm)
      .where(and(eq(wm.workspaceId, workspaceId), eq(wm.userId, userId)))
      .returning({ role: wm.role, personName: this.personLabel(userId) })
    return rows[0] ?? null
  }

  /**
   * Moves a project to another organization the mover runs, as one unit:
   * the row moves (refused in the statement when the mover is not an owner
   * or admin there, or the project is not the source's), the places of
   * open invitations into it go (they named a project of the old
   * organization), and so do the grants of people who are not in the
   * target organization; the rest follow. Its own Cloudflare accounts move
   * with it; the old organization's shared accounts — added to it, set for
   * one of its workspaces, or serving it by name — stay behind, so its
   * deploys never reach an account of an organization it left. Every delete is conditional on
   * the project now being the target's. A slug the target already uses
   * surfaces as `isUniqueViolation`, and then nothing moved. The project's
   * row afterwards says whether it moved.
   */
  async moveProject(
    projectId: string,
    fromOrganizationId: string,
    toOrganizationId: string,
    moverId: string,
  ): Promise<string> {
    const movedAt = new Date().toISOString()
    const p = this.t.projects
    const pm = this.t.projectMembers
    const wm = this.t.workspaceMembers
    const ip = this.t.invitationPlaces as typeof pm
    const ev = this.t.envVars as typeof pm
    const w = aliasedTable(this.t.workspaces, 'mw')
    const m = aliasedTable(this.t.member, 'mm')
    const mp = aliasedTable(this.t.projects, 'mp')
    const moverRuns = sql`exists (select 1 from ${aliasedFrom(m)} where ${m.organizationId} = ${toOrganizationId} and ${m.userId} = ${moverId} and ${m.role} in ${ORG_ADMINS})`
    const moved = sql`exists (select 1 from ${aliasedFrom(mp)} where ${mp.id} = ${projectId} and ${mp.organizationId} = ${toOrganizationId})`
    // Bound subqueries only: the tables being deleted from are not aliased,
    // and a column of theirs inside a subquery would name the inner table.
    const targetMembers = this.db
      .select({ userId: m.userId })
      .from(m)
      .where(eq(m.organizationId, toOrganizationId))
    const projectWorkspaces = this.db.select({ id: w.id }).from(w).where(eq(w.projectId, projectId))
    await atomically(this.db, (tx) => [
      tx
        .update(p)
        .set({ organizationId: toOrganizationId, updatedAt: movedAt })
        .where(
          and(
            eq(p.id, projectId),
            eq(p.organizationId, fromOrganizationId),
            // The deletion lock keeps the project in its org: a move removes it from there.
            isNull(p.lockedAt),
            moverRuns,
          ),
        ),
      tx.delete(ip).where(and(eq(ip.projectId, projectId), moved)),
      // The project's and its workspaces' variables name their organization
      // on the row; left behind, every list and deploy of the moved project
      // would lose them.
      tx
        .update(ev)
        .set({ organizationId: toOrganizationId })
        .where(and(eq(ev.projectId, projectId), moved)),
      ...this.moveConnections(tx, projectId, toOrganizationId, moved, projectWorkspaces),
      tx
        .delete(pm)
        .where(and(eq(pm.projectId, projectId), moved, notInArray(pm.userId, targetMembers))),
      tx
        .delete(wm)
        .where(
          and(
            inArray(wm.workspaceId, projectWorkspaces),
            moved,
            notInArray(wm.userId, targetMembers),
          ),
        ),
    ])
    return movedAt
  }

  /** The statements of a move that re-home the project's accounts (none without those tables). */
  private moveConnections(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- drizzle's transaction handle, as in `atomically`
    tx: any,
    projectId: string,
    to: string,
    moved: SQL,
    projectWorkspaces: SQLWrapper,
  ) {
    const { connections, connectionProjects, projectConnections, workspaceConnections } = this.t
    if (!connections || !connectionProjects || !projectConnections || !workspaceConnections) {
      return []
    }
    const c = connections as typeof this.t.projects
    const cp = connectionProjects as typeof this.t.projects
    const pc = projectConnections as typeof this.t.projects
    const wc = workspaceConnections as typeof this.t.projects
    const owned = aliasedTable(c, 'mco')
    const ownedIds = this.db
      .select({ id: owned.id })
      .from(owned)
      .where(eq(owned.projectId, projectId))
    return [
      tx
        .update(c)
        .set({ organizationId: to })
        .where(and(eq(c.projectId, projectId), moved)),
      tx
        .delete(pc)
        .where(and(eq(pc.projectId, projectId), moved, notInArray(pc.connectionId, ownedIds))),
      tx
        .delete(wc)
        .where(
          and(
            inArray(wc.workspaceId, projectWorkspaces),
            moved,
            notInArray(wc.connectionId, ownedIds),
          ),
        ),
      tx.delete(cp).where(and(eq(cp.projectId, projectId), moved)),
    ]
  }

  /** Whether the user holds any role in the organization (for the mover's standing in the target). */
  async orgRoleOf(organizationId: string, userId: string): Promise<string | null> {
    const m = this.t.member
    const rows = await this.db
      .select({ role: m.role })
      .from(m)
      .where(and(eq(m.organizationId, organizationId), eq(m.userId, userId)))
      .limit(1)
    return rows[0]?.role ?? null
  }
}
