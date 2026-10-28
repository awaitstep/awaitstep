import {
  orgCapabilities,
  projectCapabilities,
  rolesFromOrgRole,
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
  OrgMemberSummary,
  OrgOverview,
  ProjectOverview,
  ScopeRows,
  ScopeSlugs,
  WorkspaceOverview,
} from '@awaitstep/db'
import { parseOrgRole } from './org-role.js'

// What the dashboard reads for each level of `/{org}/{project}/{workspace}`:
// the row, its counts and lists, and what the caller may do there. Roles
// come from the org alone until B2 (`rolesFromOrgRole`).

export interface MemberRecord {
  id: string
  name: string
  email: string
  image: string | null
  role: OrgRole
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
  workspaces: ProjectOverview['workspaces']
  health: ProjectOverview['health']
  lock: LockRecord | null
  members: MemberRecord[]
  viewerRole: ProjectRole
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
  members: MemberRecord[]
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

function lockRecord(
  lockedBy: string | null,
  lockedAt: string | null,
  name: string | null,
): LockRecord | null {
  if (!lockedBy || !lockedAt) return null
  return { setBy: { id: lockedBy, name: name ?? 'Someone' }, setAt: lockedAt }
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
  orgRole: OrgRole,
  audience: RecordAudience = FOR_SESSION,
): ProjectRecord {
  const { projectRole } = rolesFromOrgRole(orgRole)
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
    viewerRole: projectRole,
    viewerCan: projectCapabilities(projectRole, lock !== null, orgRole),
  }
}

export function workspaceRecord(
  row: WorkspaceOverview,
  orgRole: OrgRole,
  audience: RecordAudience = FOR_SESSION,
): WorkspaceRecord {
  const { workspaceRole } = rolesFromOrgRole(orgRole)
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
    members: audience.withMembers ? row.members.map(memberRecord) : [],
    viewerRole: workspaceRole,
    viewerCan: workspaceCapabilities(workspaceRole, {
      ownLock: lock !== null,
      lockedByProject: inheritedLock ? inheritedLock.fromName : null,
      isLastWorkspace: row.siblings === 1,
      // Sharing arrives with B6; until then nothing calls across workspaces.
      sharedInUse: false,
    }),
  }
}

/**
 * The response for `GET /scope`. A level that was asked for and did not
 * match is reported with its parent's name, so the page can say "no
 * workspace `x` in Project 101"; a non-member reads the org as missing.
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
  const project = projectRecord(rows.project, org.role)
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
  return { found: true, org, project, workspace: workspaceRecord(rows.workspace, org.role) }
}
