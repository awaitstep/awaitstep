import type {
  ProjectAccessChoice,
  ProjectMembers,
  ProjectWideRole,
} from '../../../types/dashboard/access'
import type { ScopeSlugs } from '../../../types/dashboard/scope'
import type { WorkspaceRole } from '../../../types/dashboard/workspaces'
import { getDb, type MockDb, type ProjectRow } from '../db'
import { grantCounts } from '../../../lib/workspace-roles'
import { projectGrantedRole } from '../access'
import type { Person } from '../../../types/dashboard/session'
import type { MockContext } from '../scenario'
import { conflictError, endpoint, forbiddenError, mutation, notFoundError, rows } from '../scenario'
import { workspaceRef } from './item-records'
import { createInvites } from './org'
import { personById, projectScope, visibleWorkspaces, workspaceScope } from './records'
import { requireScope } from './resolve'

/**
 * Project settings → Members: who opens every workspace, and who opens only
 * some. Workspace grants in workspaces hidden from the viewer are left out (O9).
 */
export const listProjectMembers = endpoint(
  (ctx, orgSlug: string, projectSlug: string): ProjectMembers => {
    const db = getDb()
    const { org, project } = requireScope(db, ctx, { org: orgSlug, project: projectSlug })
    // Rows for people who left the org (or whose project moved away from them) grant nothing.
    const inOrg = new Set(db.orgMembers.filter((m) => m.orgId === org.id).map((m) => m.userId))
    const wide = new Map<string, ProjectWideRole>()
    for (const m of db.orgMembers.filter((m) => m.orgId === org.id)) {
      if (m.role === 'owner') wide.set(m.userId, 'owner')
      if (m.role === 'admin') wide.set(m.userId, 'org-admin')
    }
    for (const m of db.projectMembers.filter((m) => m.projectId === project!.id)) {
      if (inOrg.has(m.userId) && !wide.has(m.userId)) {
        wide.set(m.userId, m.role === 'admin' ? 'project-admin' : 'project-member')
      }
    }
    const visible = visibleWorkspaces(db, ctx, project!)
    const byPerson = new Map<string, ProjectMembers['workspacesOnly'][number]['workspaces']>()
    for (const w of visible) {
      for (const m of db.workspaceMembers.filter((m) => m.workspaceId === w.id)) {
        if (wide.has(m.userId) || !inOrg.has(m.userId)) continue
        byPerson.set(m.userId, [
          ...(byPerson.get(m.userId) ?? []),
          { workspace: workspaceRef(w), role: m.role },
        ])
      }
    }
    return {
      wholeProject: rows(
        ctx,
        [...wide].map(([userId, role]) => ({ person: personById(db, userId), role })),
      ),
      workspacesOnly: rows(
        ctx,
        [...byPerson].map(([userId, workspaces]) => ({
          person: personById(db, userId),
          workspaces,
        })),
      ),
    }
  },
)

/** Everyone in the org, for picking people (New workspace). P5's Members page grows this. */
export const listOrgPeople = endpoint((ctx, orgSlug: string): Person[] => {
  const db = getDb()
  const { org } = requireScope(db, ctx, { org: orgSlug })
  return rows(
    ctx,
    db.orgMembers.filter((m) => m.orgId === org.id).map((m) => personById(db, m.userId)),
  )
})

type WorkspaceSlugs = Required<ScopeSlugs>

/** The workspace, after checking the viewer may manage its members. */
function managedWorkspace(ctx: MockContext, slugs: WorkspaceSlugs) {
  const db = getDb()
  const { org, project, workspace } = requireScope(db, ctx, slugs)
  const can = workspaceScope(db, ctx, project!, workspace!).viewerCan.manageMembers
  if (!can.allowed) throw forbiddenError(can.reason!)
  return { db, org, project: project!, workspace: workspace! }
}

/**
 * Refuses a grant at or below what the project already gives: it would do
 * nothing now, and quietly keep them in if they later leave the project.
 */
function assertAboveProject(
  db: MockDb,
  project: ProjectRow,
  userId: string,
  role: WorkspaceRole,
): void {
  const fromProject = projectGrantedRole(db, { scenario: 'none', userId }, project)
  if (!grantCounts(role, fromProject)) {
    throw conflictError(`They already have ${fromProject} access through ${project.name}`)
  }
}

/** Add member: someone already in the org gets a role in this workspace. */
export const addWorkspaceMember = mutation(
  (ctx, slugs: WorkspaceSlugs, userId: string, role: WorkspaceRole): void => {
    const { db, org, project, workspace } = managedWorkspace(ctx, slugs)
    if (!db.orgMembers.some((m) => m.orgId === org.id && m.userId === userId)) {
      throw conflictError(`They need to join ${org.name} first`)
    }
    if (db.workspaceMembers.some((m) => m.workspaceId === workspace.id && m.userId === userId)) {
      throw conflictError(`Already in ${workspace.name}`)
    }
    assertAboveProject(db, project, userId, role)
    db.workspaceMembers.push({ workspaceId: workspace.id, userId, role })
  },
)

/** Change role on someone's own workspace grant (inherited roles change at the project). */
export const setWorkspaceRole = mutation(
  (ctx, slugs: WorkspaceSlugs, userId: string, role: WorkspaceRole): void => {
    const { db, project, workspace } = managedWorkspace(ctx, slugs)
    const row = db.workspaceMembers.find(
      (m) => m.workspaceId === workspace.id && m.userId === userId,
    )
    if (!row) throw notFoundError()
    assertAboveProject(db, project, userId, role)
    row.role = role
  },
)

/** Remove from the workspace: drops their own grant here. */
export const removeWorkspaceMember = mutation(
  (ctx, slugs: WorkspaceSlugs, userId: string): void => {
    const { db, workspace } = managedWorkspace(ctx, slugs)
    const before = db.workspaceMembers.length
    db.workspaceMembers = db.workspaceMembers.filter(
      (m) => !(m.workspaceId === workspace.id && m.userId === userId),
    )
    if (db.workspaceMembers.length === before) throw notFoundError()
  },
)

/** 21b's invites: new addresses join the org as Members with this workspace only. */
export const inviteToWorkspace = mutation(
  (ctx, slugs: WorkspaceSlugs, emails: string[], role: WorkspaceRole): void => {
    const { db, org, project, workspace } = managedWorkspace(ctx, slugs)
    createInvites(db, ctx, org, {
      emails,
      role: 'member',
      places: [{ projectId: project.id, workspaceId: workspace.id, role }],
    })
  },
)

/** The project, after checking the viewer may manage its members. */
function managedProject(ctx: MockContext, orgSlug: string, projectSlug: string) {
  const db = getDb()
  const { org, project } = requireScope(db, ctx, { org: orgSlug, project: projectSlug })
  const can = projectScope(db, ctx, project!).viewerCan.manageMembers
  if (!can.allowed) throw forbiddenError(can.reason!)
  return { db, org, project: project! }
}

/** 21a: someone already in the org gets the whole project, or one role in some of its workspaces. */
export const addToProject = mutation(
  (
    ctx,
    orgSlug: string,
    projectSlug: string,
    userId: string,
    access: ProjectAccessChoice,
  ): string[] | undefined => {
    const { db, org, project } = managedProject(ctx, orgSlug, projectSlug)
    if (!db.orgMembers.some((m) => m.orgId === org.id && m.userId === userId)) {
      throw conflictError(`They need to join ${org.name} first`)
    }
    if (access.scope === 'project') {
      if (db.projectMembers.some((m) => m.projectId === project.id && m.userId === userId)) {
        throw conflictError('Already in this project')
      }
      db.projectMembers.push({ projectId: project.id, userId, role: access.role })
      return undefined
    }
    const fresh = access.workspaceIds.filter(
      (id) =>
        db.workspaces.some((w) => w.id === id && w.projectId === project.id) &&
        !db.workspaceMembers.some((m) => m.workspaceId === id && m.userId === userId),
    )
    if (fresh.length === 0) throw conflictError('They already have access to those workspaces')
    db.workspaceMembers.push(
      ...fresh.map((workspaceId) => ({ workspaceId, userId, role: access.role })),
    )
    return fresh.map((id) => db.workspaces.find((w) => w.id === id)!.name)
  },
)

/** 21a's invites: new addresses join the org as Members with this project's access only. */
export const inviteToProject = mutation(
  (ctx, orgSlug: string, projectSlug: string, emails: string[], access: ProjectAccessChoice) => {
    const { db, org, project } = managedProject(ctx, orgSlug, projectSlug)
    const places =
      access.scope === 'project'
        ? [{ projectId: project.id, workspaceId: null, role: access.role }]
        : access.workspaceIds.map((workspaceId) => ({
            projectId: project.id,
            workspaceId,
            role: access.role,
          }))
    createInvites(db, ctx, org, { emails, role: 'member', places })
  },
)
