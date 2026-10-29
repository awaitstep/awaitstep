import type {
  ApiLock,
  ApiOrg,
  ApiProject,
  ApiProjectRow,
  ApiScope,
  ApiWorkspace,
  ApiWorkspaceChip,
  ApiWorkspaceRow,
} from '../../../lib/dashboard-api'
import { initialOf, initialsOf } from '../../../lib/initials'
import type { LockState } from '../../../types/dashboard/locks'
import type { Project } from '../../../types/dashboard/projects'
import type { ScopeLookup } from '../../../types/dashboard/scope'
import type { OrgSummary, Person } from '../../../types/dashboard/session'
import type { Workspace, WorkspacePerson } from '../../../types/dashboard/workspaces'
import { toWorkspacePerson } from './access'

// API responses → the records the pages render. The API already decides
// roles and capabilities; this adds what the pages derive (initials, people
// as persons) and shapes the locks the way the kit shows them.

export function toPerson(member: {
  id: string
  name: string
  email: string
  image: string | null
}): Person {
  return {
    id: member.id,
    name: member.name,
    email: member.email,
    initials: initialsOf(member.name, member.email),
    image: member.image,
  }
}

export function toOrgSummary(org: ApiOrg): OrgSummary {
  return {
    id: org.id,
    slug: org.slug,
    name: org.name,
    initial: initialOf(org.name),
    // better-auth stores a cleared logo as an empty string.
    logo: org.logo || null,
    role: org.role,
    projectCount: org.projectCount,
    memberCount: org.memberCount,
    // Not tracked by the API; the dashboard remembers the last org itself.
    lastOpenedAt: null,
  }
}

function lockState(
  own: ApiLock | null,
  inherited: ApiWorkspace['inheritedLock'] = null,
): LockState {
  return { own, inherited }
}

export function toProject(project: ApiProject): Project {
  return {
    id: project.id,
    organizationId: project.organizationId,
    slug: project.slug,
    name: project.name,
    description: project.description,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    initial: initialOf(project.name),
    workspaces: project.workspaces,
    people: project.members.map(toPerson),
    lock: lockState(project.lock),
    health: project.health,
  }
}

export function toWorkspace(workspace: ApiWorkspace): Workspace {
  return {
    id: workspace.id,
    projectId: workspace.projectId,
    slug: workspace.slug,
    name: workspace.name,
    initial: initialOf(workspace.name),
    description: workspace.description,
    colour: workspace.colour,
    people: workspace.members.map(toPerson),
    createdAt: workspace.createdAt,
    createdBy: workspace.createdBy,
    lock: lockState(workspace.lock, workspace.inheritedLock),
    // Sharing arrives with the shared library (B6).
    counts: { ...workspace.counts, sharedOut: 0 },
  }
}

/** Everyone who can open the workspace, with their effective role there and where it comes from. */
export function toWorkspacePeople(workspace: ApiWorkspace): WorkspacePerson[] {
  return workspace.members.map(toWorkspacePerson)
}

export function toScopeLookup(scope: ApiScope): ScopeLookup {
  if (!scope.found) return scope
  const org = {
    org: toOrgSummary(scope.org),
    viewerRole: scope.org.role,
    viewerCan: scope.org.viewerCan,
  }
  if (!scope.project) return { found: true, org }
  const project = {
    project: toProject(scope.project),
    viewerRole: scope.project.viewerRole,
    viewerCan: scope.project.viewerCan,
  }
  if (!scope.workspace) return { found: true, org, project }
  return {
    found: true,
    org,
    project,
    workspace: {
      workspace: toWorkspace(scope.workspace),
      viewerRole: scope.workspace.viewerRole,
      viewerCan: scope.workspace.viewerCan,
    },
  }
}

/**
 * A workspace as a create or rename answers with it: the row alone, with
 * nothing in it yet. The lists refetch for the rest.
 */
export function workspaceFromRow(row: ApiWorkspaceRow, people: Person[] = []): Workspace {
  return {
    id: row.id,
    projectId: row.projectId,
    slug: row.slug,
    name: row.name,
    initial: initialOf(row.name),
    description: row.description,
    colour: row.colour,
    people,
    createdAt: row.createdAt,
    createdBy: row.createdBy ? { id: row.createdBy, name: '' } : null,
    lock: lockState(null),
    counts: {
      workflows: 0,
      deployed: 0,
      functions: 0,
      sharedOut: 0,
      runs24h: 0,
      failing: 0,
      lastRunAt: null,
    },
  }
}

/** A project as a create or rename answers with it, with the workspaces known so far. */
export function projectFromRow(row: ApiProjectRow, workspaces: ApiWorkspaceChip[] = []): Project {
  return {
    id: row.id,
    organizationId: row.organizationId,
    slug: row.slug,
    name: row.name,
    description: row.description,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    initial: initialOf(row.name),
    workspaces,
    people: [],
    lock: lockState(null),
    health: { workflows: 0, deployed: 0, failing: 0, lastRunAt: null },
  }
}
