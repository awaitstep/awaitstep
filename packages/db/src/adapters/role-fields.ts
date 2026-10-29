import { sql, aliasedTable, type SQL } from 'drizzle-orm'
import { aliasedFrom } from './json-array.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTable = any

/** The tables a role is read from, beside the overview ones. */
export interface AccessTables {
  organization: AnyTable
  member: AnyTable
  user: AnyTable
  session: AnyTable
  projects: AnyTable
  workspaces: AnyTable
  projectMembers: AnyTable
  workspaceMembers: AnyTable
}

/** A person: a bound id, or a column of the row being read. */
type Who = string | SQL | unknown

/** A place: the organization, project and workspace ids as bound values or columns. */
export interface PlaceRefs {
  organizationId: SQL | unknown
  projectId: SQL | unknown
  workspaceId: SQL | unknown
}

const ORG_ADMINS = sql.raw(`('owner', 'admin')`)

/**
 * The role table of @awaitstep/ir (`resolveRoles`), as SQL: how an
 * organization role, a project grant and a workspace grant make one person's
 * standing at one place. Every expression here is a scalar or a boolean a
 * statement can filter on, so a workspace someone may not open never leaves
 * the database. The API resolves the roles it answers with from the rows
 * these read; a test holds the two tables to each other.
 */
export class RoleFields {
  constructor(private t: AccessTables) {}

  /** `member.role` for one person in one organization, or null. */
  orgRoleOf(who: Who, organizationId: SQL | unknown): SQL {
    const om = aliasedTable(this.t.member, 'rom')
    return sql`(select ${om.role} from ${aliasedFrom(om)} where ${om.organizationId} = ${organizationId} and ${om.userId} = ${who} limit 1)`
  }

  projectGrantOf(who: Who, projectId: SQL | unknown): SQL {
    const pm = aliasedTable(this.t.projectMembers, 'rpm')
    return sql`(select ${pm.role} from ${aliasedFrom(pm)} where ${pm.projectId} = ${projectId} and ${pm.userId} = ${who})`
  }

  workspaceGrantOf(who: Who, workspaceId: SQL | unknown): SQL {
    const wm = aliasedTable(this.t.workspaceMembers, 'rwm')
    return sql`(select ${wm.role} from ${aliasedFrom(wm)} where ${wm.workspaceId} = ${workspaceId} and ${wm.userId} = ${who})`
  }

  /** Whether they hold a grant in any workspace of the project. */
  hasWorkspaceGrantIn(who: Who, projectId: SQL | unknown): SQL {
    const wm = aliasedTable(this.t.workspaceMembers, 'rhw')
    const w = aliasedTable(this.t.workspaces, 'rhs')
    return sql`exists (select 1 from ${aliasedFrom(wm)} inner join ${aliasedFrom(w)} on ${w.id} = ${wm.workspaceId} where ${w.projectId} = ${projectId} and ${wm.userId} = ${who})`
  }

  /** `resolveRoles().projectRole`: org owners and admins are admins of every project. */
  projectRole(orgRole: SQL, projectGrant: SQL): SQL {
    return sql`(case when ${orgRole} is null then null when ${orgRole} in ${ORG_ADMINS} then 'admin' else ${projectGrant} end)`
  }

  /** `resolveRoles().inheritedWorkspaceRole`: what the project alone gives. */
  inheritedWorkspaceRole(orgRole: SQL, projectGrant: SQL): SQL {
    return sql`(case when ${orgRole} is null then null when ${orgRole} in ${ORG_ADMINS} then 'admin' when ${projectGrant} = 'admin' then 'admin' when ${projectGrant} = 'member' then 'editor' else null end)`
  }

  /** `resolveRoles().workspaceRole`: null means the workspace is hidden from them. */
  workspaceRole(orgRole: SQL, projectGrant: SQL, workspaceGrant: SQL): SQL {
    return sql`(case when ${orgRole} is null then null when ${orgRole} in ${ORG_ADMINS} then 'admin' when ${projectGrant} = 'admin' then 'admin' when ${projectGrant} = 'member' then (case when ${workspaceGrant} = 'admin' then 'admin' else 'editor' end) else ${workspaceGrant} end)`
  }

  /** Viewer 0, editor 1, admin 2, nothing -1: the ranking `grantCounts` compares. */
  rank(role: SQL | string): SQL {
    return sql`(case ${role} when 'admin' then 2 when 'editor' then 1 when 'viewer' then 0 else -1 end)`
  }

  /** One person's effective role in one workspace, from the rows alone. */
  workspaceRoleOf(who: Who, place: PlaceRefs): SQL {
    return this.workspaceRole(
      this.orgRoleOf(who, place.organizationId),
      this.projectGrantOf(who, place.projectId),
      this.workspaceGrantOf(who, place.workspaceId),
    )
  }

  projectRoleOf(who: Who, place: Omit<PlaceRefs, 'workspaceId'>): SQL {
    return this.projectRole(
      this.orgRoleOf(who, place.organizationId),
      this.projectGrantOf(who, place.projectId),
    )
  }

  /** `canSeeProject`: through the org, a project role, or a grant in any workspace of it. */
  projectVisible(who: Who, place: Omit<PlaceRefs, 'workspaceId'>): SQL {
    const om = aliasedTable(this.t.member, 'rvm')
    return sql`exists (select 1 from ${aliasedFrom(om)} where ${om.organizationId} = ${place.organizationId} and ${om.userId} = ${who} and (${om.role} in ${ORG_ADMINS} or ${this.projectGrantOf(who, place.projectId)} is not null or ${this.hasWorkspaceGrantIn(who, place.projectId)}))`
  }

  /** Whether the workspace a workflow sits in is one they can open; `workspaceId` is the workflow row's column. */
  workflowVisible(who: Who, workspaceId: SQL): SQL {
    const w = aliasedTable(this.t.workspaces, 'rfw')
    const p = aliasedTable(this.t.projects, 'rfp')
    return sql`exists (select 1 from ${aliasedFrom(w)} inner join ${aliasedFrom(p)} on ${p.id} = ${w.projectId} where ${w.id} = ${workspaceId} and ${this.workspaceRoleOf(who, { organizationId: p.organizationId, projectId: p.id, workspaceId: w.id })} is not null)`
  }

  /** Projects in the organization they can open. */
  visibleProjectCount(who: Who, organizationId: SQL | unknown): SQL<number> {
    const p = aliasedTable(this.t.projects, 'rcp')
    return sql<number>`(select count(*) from ${aliasedFrom(p)} where ${p.organizationId} = ${organizationId} and ${this.projectVisible(who, { organizationId: p.organizationId, projectId: p.id })})`.mapWith(
      Number,
    )
  }
}
