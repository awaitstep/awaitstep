import type { ProjectMembers, ProjectWideRole } from '../../../types/dashboard/access'
import type { ScopeSlugs } from '../../../types/dashboard/scope'
import type { WorkspaceRole } from '../../../types/dashboard/workspaces'
import { getDb, type MockDb, type ProjectRow } from '../db'
import { grantCounts } from '../../../lib/workspace-roles'
import { projectGrantedRole } from '../access'
import type { Person } from '../../../types/dashboard/session'
import type { MockContext } from '../scenario'
import { conflictError, endpoint, forbiddenError, mutation, notFoundError, rows } from '../scenario'
import { workspaceRef } from './item-records'
import { personById, visibleWorkspaces, workspaceScope } from './records'
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
