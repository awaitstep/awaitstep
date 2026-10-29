import {
  orgCapabilities,
  projectCapabilities,
  resolveRoles,
  workspaceCapabilities,
  type Capabilities,
  type OrgCapability,
  type OrgRole,
  type ProjectCapability,
  type ProjectRole,
  type WorkspaceCapability,
  type WorkspaceRole,
} from '@awaitstep/ir'
import type {
  GrantRows,
  OrgMemberSummary,
  OrgOverview,
  ProjectOverview,
  ScopeRows,
  ScopeSlugs,
  WorkspaceOverview,
  WorkspacePersonRow,
} from '@awaitstep/db'
import { parseOrgRole } from './org-role.js'
import { personOf } from './sharing.js'

// What the dashboard reads for each level of `/{org}/{project}/{workspace}`:
// the row, its counts and lists, and what the caller may do there. Roles are
// resolved here, by @awaitstep/ir, from the membership rows each read
// returned alongside the row.

export interface MemberRecord {
  id: string
  name: string
  email: string
  image: string | null
  role: OrgRole
}

/** Someone who can open a workspace, with their effective role there and where it comes from. */
export interface WorkspacePersonRecord {
  id: string
  name: string
  email: string
  image: string | null
  role: WorkspaceRole
  /** The role comes from the project or org, not a grant in the workspace itself. */
  inherited: boolean
  /** The role the project alone gives them; a grant counts only above it. */
  projectRole: WorkspaceRole | null
  /** Org owners and admins open every workspace through the org. */
  orgRole: 'owner' | 'admin' | null
  lastActiveAt: string | null
}

export interface LockRecord {
  setBy: { id: string; name: string }
  setAt: string
}

export interface OrgRecord {
  id: string
  slug: string
  name: string
  logo: string | null
  createdAt: string
  /** The caller's role in it. */
  role: OrgRole
  /** Projects the caller can open. */
  projectCount: number
  memberCount: number
  viewerCan: Capabilities<OrgCapability>
}

export interface OrgScopeRecord extends OrgRecord {
  members: MemberRecord[]
}

export interface ProjectRecord {
  id: string
  organizationId: string
  slug: string
  name: string
  description: string | null
  createdAt: string
  updatedAt: string
  /** The workspaces the caller can open. */
  workspaces: ProjectOverview['workspaces']
  health: ProjectOverview['health']
  lock: LockRecord | null
  /** Who can open a workspace the caller can open. */
  members: MemberRecord[]
  /** Null for someone who reaches the project through a workspace grant alone. */
  viewerRole: ProjectRole | null
  viewerCan: Capabilities<ProjectCapability>
}

export interface WorkspaceRecord {
  id: string
  projectId: string
  slug: string
  name: string
  description: string | null
  colour: string
  createdAt: string
  updatedAt: string
  createdBy: { id: string; name: string } | null
  lock: LockRecord | null
  /** The project's lock, which covers this workspace too. */
  inheritedLock: { fromName: string; lock: LockRecord } | null
  counts: WorkspaceOverview['counts']
  members: WorkspacePersonRecord[]
  viewerRole: WorkspaceRole
  viewerCan: Capabilities<WorkspaceCapability>
}

export interface NotFoundRecord {
  kind: 'organization' | 'project' | 'workspace'
  slug: string
  parent: { name: string; slug: string } | null
}

export type ScopeResponse =
  | { found: true; org: OrgScopeRecord; project?: ProjectRecord; workspace?: WorkspaceRecord }
  | { found: false; notFound: NotFoundRecord }

function memberRecord(row: OrgMemberSummary): MemberRecord {
  return { ...row, role: parseOrgRole(row.role) }
}

/** The roles a set of membership rows resolves to. */
export function rolesOf(rows: GrantRows) {
  return resolveRoles({
    orgRole: rows.orgRole === null ? null : parseOrgRole(rows.orgRole),
    projectGrant: rows.projectGrant,
    workspaceGrant: rows.workspaceGrant,
  })
}

export function workspacePersonRecord(row: WorkspacePersonRow): WorkspacePersonRecord {
  const roles = rolesOf(row)
  // The read lists only people who can open the workspace, so the role is never null.
  const role = roles.workspaceRole ?? 'viewer'
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    image: row.image,
    role,
    inherited: role === roles.inheritedWorkspaceRole,
    projectRole: roles.inheritedWorkspaceRole,
    orgRole: roles.orgRole === 'owner' || roles.orgRole === 'admin' ? roles.orgRole : null,
    lastActiveAt: row.lastActiveAt,
  }
}

export function lockRecord(
  lockedBy: string | null,
  lockedAt: string | null,
  name: string | null,
): LockRecord | null {
  // On is `locked_at`, as every check in the database reads it; the setter
  // may be unknown (no row on record, or left the org), never the lock.
  if (!lockedAt) return null
  return { setBy: personOf(lockedBy, name), setAt: lockedAt }
}

export function orgRecord(row: OrgOverview): OrgRecord {
  const role = parseOrgRole(row.viewerRole)
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    logo: row.logo,
    createdAt: row.createdAt,
    role,
    projectCount: row.projectCount,
    memberCount: row.memberCount,
    viewerCan: orgCapabilities(role, row.projectCount),
  }
}

/** What the caller is: a key never gets the member roster (names and emails). */
export interface RecordAudience {
  withMembers: boolean
}

export const FOR_SESSION: RecordAudience = { withMembers: true }
export const FOR_KEY: RecordAudience = { withMembers: false }

export function projectRecord(
  row: ProjectOverview,
  audience: RecordAudience = FOR_SESSION,
): ProjectRecord {
  const roles = rolesOf(row.viewer)
  const lock = lockRecord(row.lockedBy, row.lockedAt, row.lockedByName)
  return {
    id: row.id,
    organizationId: row.organizationId,
    slug: row.slug,
    name: row.name,
    description: row.description,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    workspaces: row.workspaces,
    health: row.health,
    lock,
    members: audience.withMembers ? row.members.map(memberRecord) : [],
    viewerRole: roles.projectRole,
    viewerCan: projectCapabilities(
      roles.projectRole,
      { ownLock: lock !== null, lockedWorkspaces: row.lockedWorkspaces },
      roles.orgRole,
    ),
  }
}

export function workspaceRecord(
  row: WorkspaceOverview,
  audience: RecordAudience = FOR_SESSION,
): WorkspaceRecord {
  const roles = rolesOf(row.viewer)
  // The read hides workspaces the caller cannot open, so the role is never null.
  const workspaceRole = roles.workspaceRole ?? 'viewer'
  const lock = lockRecord(row.lockedBy, row.lockedAt, row.lockedByName)
  // The project's locker is not joined here; the lock's presence is what the rules need.
  const inheritedLock = row.projectLockedAt
    ? {
        fromName: row.projectName,
        lock: { setBy: { id: '', name: '' }, setAt: row.projectLockedAt },
      }
    : null
  return {
    id: row.id,
    projectId: row.projectId,
    slug: row.slug,
    name: row.name,
    description: row.description,
    colour: row.colour,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy ? { id: row.createdBy, name: row.createdByName ?? 'Someone' } : null,
    lock,
    inheritedLock,
    counts: row.counts,
    members: audience.withMembers ? row.members.map(workspacePersonRecord) : [],
    viewerRole: workspaceRole,
    viewerCan: workspaceCapabilities(workspaceRole, {
      ownLock: lock !== null,
      lockedByProject: inheritedLock ? inheritedLock.fromName : null,
      isLastWorkspace: row.siblings === 1,
      // Nothing calls across workspaces until the Call Workflow node links callers (D-B6-3).
      sharedInUse: false,
    }),
  }
}

/**
 * The response for `GET /scope`. A level that was asked for and did not
 * match — or that the caller may not open — is reported with its parent's
 * name, so the page can say "no workspace `x` in Project 101"; a non-member
 * reads the org as missing.
 */
export function toScopeResponse(rows: ScopeRows | null, slugs: ScopeSlugs): ScopeResponse {
  if (!rows) {
    return { found: false, notFound: { kind: 'organization', slug: slugs.org, parent: null } }
  }
  const org = { ...orgRecord(rows.org), members: rows.org.members.map(memberRecord) }
  if (slugs.project === undefined) return { found: true, org }
  if (!rows.project) {
    return {
      found: false,
      notFound: {
        kind: 'project',
        slug: slugs.project,
        parent: { name: org.name, slug: org.slug },
      },
    }
  }
  const project = projectRecord(rows.project)
  if (slugs.workspace === undefined) return { found: true, org, project }
  if (!rows.workspace) {
    return {
      found: false,
      notFound: {
        kind: 'workspace',
        slug: slugs.workspace,
        parent: { name: project.name, slug: project.slug },
      },
    }
  }
  return { found: true, org, project, workspace: workspaceRecord(rows.workspace) }
}
