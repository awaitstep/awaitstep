import {
  canSeeProject as seesProject,
  inheritedWorkspaceRole,
  resolveRoles,
  type RoleGrants,
} from '@awaitstep/ir'
import type { ProjectRole } from '../../types/dashboard/projects'
import type { OrgRole } from '../../types/dashboard/session'
import type { WorkspaceRole } from '../../types/dashboard/workspaces'
import type { MockDb, ProjectRow, WorkspaceRow } from './db'
import type { MockContext } from './scenario'

// The role table the dashboard IA agreed (O1, O9) lives in @awaitstep/ir
// (`resolveRoles`), where the API applies it too. This file only reads the
// dummy membership rows and adds the `?mock=viewer` scenario on top.

function grantsOf(
  db: MockDb,
  ctx: MockContext,
  project: ProjectRow,
  workspace?: WorkspaceRow,
): RoleGrants {
  const orgRow = db.orgMembers.find((m) => m.orgId === project.orgId && m.userId === ctx.userId)
  const projectRow = db.projectMembers.find(
    (m) => m.projectId === project.id && m.userId === ctx.userId,
  )
  const workspaceRow = workspace
    ? db.workspaceMembers.find((m) => m.workspaceId === workspace.id && m.userId === ctx.userId)
    : undefined
  return {
    orgRole: orgRow?.role ?? null,
    projectGrant: projectRow?.role ?? null,
    workspaceGrant: workspaceRow?.role ?? null,
  }
}

export function orgRoleOf(db: MockDb, ctx: MockContext, orgId: string): OrgRole | null {
  const row = db.orgMembers.find((m) => m.orgId === orgId && m.userId === ctx.userId)
  if (!row) return null
  return ctx.scenario === 'viewer' ? 'member' : row.role
}

/** Effective project role: org owners and admins count as project admins. */
export function projectRoleOf(
  db: MockDb,
  ctx: MockContext,
  project: ProjectRow,
): ProjectRole | null {
  if (ctx.scenario === 'viewer') return null
  return resolveRoles(grantsOf(db, ctx, project)).projectRole
}

/**
 * The workspace role the project alone gives (admin → Admin, member →
 * Editor), before any workspace grant. A role equal to it is inherited.
 */
export function projectGrantedRole(
  db: MockDb,
  ctx: MockContext,
  project: ProjectRow,
): WorkspaceRole | null {
  return inheritedWorkspaceRole(projectRoleOf(db, ctx, project))
}

/** Effective workspace role, or null when the workspace is hidden from the viewer. */
export function workspaceRoleOf(
  db: MockDb,
  ctx: MockContext,
  project: ProjectRow,
  workspace: WorkspaceRow,
): WorkspaceRole | null {
  const role = resolveRoles(grantsOf(db, ctx, project, workspace)).workspaceRole
  if (!role) return null
  return ctx.scenario === 'viewer' ? 'viewer' : role
}

/** Whether the project shows up for the viewer at all (`?mock=viewer` hides nothing extra). */
export function canSeeProject(db: MockDb, ctx: MockContext, project: ProjectRow): boolean {
  const grants = grantsOf(db, ctx, project)
  const hasWorkspaceGrant = db.workspaces.some(
    (w) =>
      w.projectId === project.id &&
      db.workspaceMembers.some((m) => m.workspaceId === w.id && m.userId === ctx.userId),
  )
  return seesProject(grants.orgRole, grants.projectGrant, hasWorkspaceGrant)
}

// The capability tables live in @awaitstep/ir, where the API applies them too.
export {
  ACCESS_REASONS as REASONS,
  orgCapabilities,
  projectCapabilities,
  workspaceCapabilities,
  type WorkspaceFacts,
} from '@awaitstep/ir'
