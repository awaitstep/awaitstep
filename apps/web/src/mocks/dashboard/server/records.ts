import type { Lock, LockState } from '../../../types/dashboard/locks'
import type { Project } from '../../../types/dashboard/projects'
import type { OrgScope, ProjectScope, WorkspaceScope } from '../../../types/dashboard/scope'
import type { OrgListing, OrgSummary, Person } from '../../../types/dashboard/session'
import type { Workspace } from '../../../types/dashboard/workspaces'
import {
  canSeeProject,
  orgCapabilities,
  orgRoleOf,
  projectCapabilities,
  projectGrantedRole,
  projectRoleOf,
  workspaceCapabilities,
  workspaceRoleOf,
} from '../access'
import type { LockRow, MockDb, OrgRow, ProjectRow, WorkspaceRow } from '../db'
import { type MockContext, notFoundError } from '../scenario'
import { callersOf, workspaceCounts, workspaceRunsByHour } from './item-records'

// Row → record joins: what the fake API returns for each table.

export function personById(db: MockDb, id: string): Person {
  const person = db.people.find((p) => p.id === id)
  if (!person) throw notFoundError()
  return person
}

function lockRecord(db: MockDb, row: LockRow | null): Lock | null {
  if (!row) return null
  return { setBy: { id: row.setBy, name: personById(db, row.setBy).name }, setAt: row.setAt }
}

function initial(name: string): string {
  return name.trim().charAt(0).toUpperCase()
}

export function orgRecord(db: MockDb, ctx: MockContext, row: OrgRow): OrgSummary {
  const membership = db.orgMembers.find((m) => m.orgId === row.id && m.userId === ctx.userId)
  const role = orgRoleOf(db, ctx, row.id)
  if (!membership || !role) throw notFoundError()
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    initial: initial(row.name),
    logo: row.logo,
    role,
    // Only what the viewer can open: a hidden project must not show up even as a count (O9).
    projectCount: db.projects.filter((p) => p.orgId === row.id && canSeeProject(db, ctx, p)).length,
    memberCount: db.orgMembers.filter((m) => m.orgId === row.id).length,
    lastOpenedAt: membership.lastOpenedAt,
  }
}

/**
 * Everyone who can open the workspace, in the order the canvas draws them:
 * org owners and admins, the workspace's own members, then project members.
 */
export function workspacePeople(
  db: MockDb,
  project: ProjectRow,
  workspace: WorkspaceRow,
): Person[] {
  const real: MockContext = { scenario: 'none', userId: '' }
  const ids = [
    ...db.orgMembers
      .filter((m) => m.orgId === project.orgId && (m.role === 'owner' || m.role === 'admin'))
      .map((m) => m.userId),
    ...db.workspaceMembers.filter((m) => m.workspaceId === workspace.id).map((m) => m.userId),
    ...db.projectMembers.filter((m) => m.projectId === project.id).map((m) => m.userId),
  ]
  return [...new Set(ids)]
    .filter((userId) => workspaceRoleOf(db, { ...real, userId }, project, workspace))
    .map((userId) => personById(db, userId))
}

function workspaceLock(db: MockDb, project: ProjectRow, workspace: WorkspaceRow): LockState {
  const projectLock = lockRecord(db, project.lock)
  return {
    own: lockRecord(db, workspace.lock),
    inherited: projectLock ? { fromName: project.name, lock: projectLock } : null,
  }
}

export function visibleWorkspaces(
  db: MockDb,
  ctx: MockContext,
  project: ProjectRow,
): WorkspaceRow[] {
  return db.workspaces.filter(
    (w) => w.projectId === project.id && workspaceRoleOf(db, ctx, project, w) !== null,
  )
}

// The edit right depends on the role alone; these facts only gate delete and lock.
const NO_FACTS = {
  ownLock: false,
  lockedByProject: null,
  isLastWorkspace: false,
  sharedInUse: false,
}

export function workspaceRecord(
  db: MockDb,
  ctx: MockContext,
  project: ProjectRow,
  row: WorkspaceRow,
): Workspace {
  const role = workspaceRoleOf(db, ctx, project, row)
  return {
    id: row.id,
    projectId: row.projectId,
    slug: row.slug,
    name: row.name,
    initial: initial(row.name),
    description: row.description,
    colour: row.colour,
    people: workspacePeople(db, project, row),
    createdAt: row.createdAt,
    createdBy: { id: row.createdBy, name: personById(db, row.createdBy).name },
    lock: workspaceLock(db, project, row),
    counts: workspaceCounts(db, row),
    viewerCanEdit: role !== null && workspaceCapabilities(role, NO_FACTS).edit.allowed,
  }
}

export function projectRecord(db: MockDb, ctx: MockContext, row: ProjectRow): Project {
  const workspaces = visibleWorkspaces(db, ctx, row)
  const people = new Map<string, Person>()
  const health = { workflows: 0, deployed: 0, failing: 0, lastRunAt: null as string | null }
  // Hidden workspaces add no people and no health, or the card would reveal them.
  for (const w of workspaces) {
    for (const person of workspacePeople(db, row, w)) people.set(person.id, person)
    const counts = workspaceCounts(db, w)
    health.workflows += counts.workflows
    health.deployed += counts.deployed
    health.failing += counts.failing
    if (counts.lastRunAt && (!health.lastRunAt || counts.lastRunAt > health.lastRunAt)) {
      health.lastRunAt = counts.lastRunAt
    }
  }
  return {
    id: row.id,
    organizationId: row.orgId,
    slug: row.slug,
    name: row.name,
    description: row.description,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    initial: initial(row.name),
    workspaces: workspaces.map((w) => ({ id: w.id, slug: w.slug, name: w.name, colour: w.colour })),
    people: [...people.values()],
    lock: { own: lockRecord(db, row.lock), inherited: null },
    health,
  }
}

/** The org on the viewer's list: its summary, their own grants, and the health of what they open. */
export function orgListingRecord(db: MockDb, ctx: MockContext, row: OrgRow): OrgListing {
  const summary = orgRecord(db, ctx, row)
  const projects = db.projects.filter((p) => p.orgId === row.id)
  const admin = summary.role === 'owner' || summary.role === 'admin'
  const health = { failing: 0, lastRunAt: null as string | null }
  for (const project of projects.filter((p) => canSeeProject(db, ctx, p))) {
    const own = projectRecord(db, ctx, project).health
    health.failing += own.failing
    if (own.lastRunAt && (!health.lastRunAt || own.lastRunAt > health.lastRunAt)) {
      health.lastRunAt = own.lastRunAt
    }
  }
  return {
    ...summary,
    grants: {
      projects: admin
        ? []
        : db.projectMembers
            .filter((m) => m.userId === ctx.userId)
            .flatMap((m) => {
              const project = projects.find((p) => p.id === m.projectId)
              return project ? [{ name: project.name, role: m.role }] : []
            }),
      workspaces: admin
        ? []
        : db.workspaceMembers
            .filter((m) => m.userId === ctx.userId)
            .flatMap((m) => {
              const workspace = db.workspaces.find((w) => w.id === m.workspaceId)
              const project = workspace && projects.find((p) => p.id === workspace.projectId)
              // The role they work as there, as the API reads it.
              const role = workspace && project && workspaceRoleOf(db, ctx, project, workspace)
              return workspace && project && role
                ? [{ name: workspace.name, projectName: project.name, role }]
                : []
            }),
    },
    health,
  }
}

export function orgScope(db: MockDb, ctx: MockContext, row: OrgRow): OrgScope {
  const org = orgRecord(db, ctx, row)
  const projectsLeft = db.projects.filter((p) => p.orgId === row.id).length
  return { org, viewerRole: org.role, viewerCan: orgCapabilities(org.role, projectsLeft) }
}

export function projectScope(db: MockDb, ctx: MockContext, row: ProjectRow): ProjectScope {
  const viewerRole = projectRoleOf(db, ctx, row)
  return {
    project: projectRecord(db, ctx, row),
    viewerRole,
    viewerCan: projectCapabilities(
      viewerRole,
      {
        ownLock: row.lock !== null,
        lockedWorkspaces: db.workspaces
          .filter((w) => w.projectId === row.id && w.lock !== null)
          .map((w) => w.name),
      },
      orgRoleOf(db, ctx, row.orgId),
    ),
  }
}

export function workspaceScope(
  db: MockDb,
  ctx: MockContext,
  project: ProjectRow,
  row: WorkspaceRow,
): WorkspaceScope {
  const viewerRole = workspaceRoleOf(db, ctx, project, row)
  if (!viewerRole) throw notFoundError()
  const orgRows = new Map(
    db.orgMembers.filter((m) => m.orgId === project.orgId).map((m) => [m.userId, m]),
  )
  const people = workspacePeople(db, project, row).map((person) => {
    const as = { scenario: 'none' as const, userId: person.id }
    const role = workspaceRoleOf(db, as, project, row)!
    const projectRole = projectGrantedRole(db, as, project)
    const orgRow = orgRows.get(person.id)
    return {
      person,
      role,
      inherited: role === projectRole,
      lastActiveAt: orgRow?.lastOpenedAt ?? null,
      projectRole,
      orgRole:
        orgRow?.role === 'owner' || orgRow?.role === 'admin'
          ? (orgRow.role as 'owner' | 'admin')
          : null,
    }
  })
  return {
    workspace: {
      ...workspaceRecord(db, ctx, project, row),
      runsByHour: workspaceRunsByHour(db, row),
    },
    people,
    viewerRole,
    viewerCan: workspaceCapabilities(viewerRole, {
      ownLock: row.lock !== null,
      lockedByProject: project.lock ? project.name : null,
      isLastWorkspace: db.workspaces.filter((w) => w.projectId === project.id).length === 1,
      sharedInUse: db.items.some(
        (i) => i.workspaceId === row.id && i.sharing && callersOf(db, i).length > 0,
      ),
    }),
  }
}
