import type { ProjectRole } from '../../types/dashboard/projects'
import type {
  Allowed,
  Capabilities,
  OrgCapability,
  ProjectCapability,
  WorkspaceCapability,
} from '../../types/dashboard/scope'
import type { OrgRole } from '../../types/dashboard/session'
import type { WorkspaceRole } from '../../types/dashboard/workspaces'
import type { MockDb, ProjectRow, WorkspaceRow } from './db'
import type { MockContext } from './scenario'

// The role table the dashboard IA agreed (O1, O9). The fake API applies it
// and hands pages capabilities; it is the spec for the real one (B2).
//
// - Org owners and admins open and manage everything.
// - A project admin manages the project and every workspace in it.
// - A project member opens every workspace in the project as an Editor;
//   a workspace role can raise that to Admin.
// - Otherwise a person opens only the workspaces they hold a role in.
// - Viewers read and run; they never edit, deploy or share.
// - A workspace nobody gave you is not found, never "forbidden".

const ROLE_RANK: Record<WorkspaceRole, number> = { viewer: 0, editor: 1, admin: 2 }

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
  const orgRole = orgRoleOf(db, ctx, project.orgId)
  if (orgRole === 'owner' || orgRole === 'admin') return 'admin'
  if (!orgRole) return null
  const row = db.projectMembers.find((m) => m.projectId === project.id && m.userId === ctx.userId)
  return row?.role ?? null
}

function realWorkspaceRole(
  db: MockDb,
  ctx: MockContext,
  project: ProjectRow,
  workspace: WorkspaceRow,
): WorkspaceRole | null {
  const real: MockContext = { ...ctx, scenario: 'none' }
  const projectRole = projectRoleOf(db, real, project)
  if (projectRole === 'admin') return 'admin'
  if (!orgRoleOf(db, real, project.orgId)) return null
  const grant = db.workspaceMembers.find(
    (m) => m.workspaceId === workspace.id && m.userId === ctx.userId,
  )?.role
  if (projectRole === 'member') {
    return grant && ROLE_RANK[grant] > ROLE_RANK.editor ? grant : 'editor'
  }
  return grant ?? null
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
  const projectRole = projectRoleOf(db, ctx, project)
  if (projectRole === 'admin') return 'admin'
  return projectRole === 'member' ? 'editor' : null
}

/** Effective workspace role, or null when the workspace is hidden from the viewer. */
export function workspaceRoleOf(
  db: MockDb,
  ctx: MockContext,
  project: ProjectRow,
  workspace: WorkspaceRow,
): WorkspaceRole | null {
  const role = realWorkspaceRole(db, ctx, project, workspace)
  if (!role) return null
  return ctx.scenario === 'viewer' ? 'viewer' : role
}

export function canSeeProject(db: MockDb, ctx: MockContext, project: ProjectRow): boolean {
  if (projectRoleOf(db, { ...ctx, scenario: 'none' }, project)) return true
  return db.workspaces.some(
    (w) => w.projectId === project.id && workspaceRoleOf(db, ctx, project, w) !== null,
  )
}

const YES: Allowed = { allowed: true }
const no = (reason: string): Allowed => ({ allowed: false, reason })

export const REASONS = {
  orgAdmins: 'Only org owners and admins can do this',
  projectAdmins: 'Only project admins and org owners can do this',
  workspaceAdmins: 'Only this workspace’s admins can do this',
  needsEditor: 'Building, deploying and sharing need an Editor',
  // The ViewerWorkflows board's title on the disabled share switch.
  shareNeedsEditor: 'Only Editors can share',
  lockToggle: 'Only this workspace’s admins and editors can change the lock',
  lockFirst: 'Turn off the deletion lock first',
  lastWorkspace: 'A project’s last workspace can’t be deleted',
  sharedInUse: 'Other workspaces call its shared workflows. Unshare them first',
  lockedBy: (name: string) => `Locked by ${name}`,
} as const

export function orgCapabilities(role: OrgRole): Capabilities<OrgCapability> {
  const admin = role === 'owner' || role === 'admin'
  return {
    createProject: YES,
    manageSettings: admin ? YES : no(REASONS.orgAdmins),
  }
}

export function projectCapabilities(
  role: ProjectRole | null,
  locked: boolean,
  orgRole: OrgRole | null = null,
): Capabilities<ProjectCapability> {
  const admin = role === 'admin' ? YES : no(REASONS.projectAdmins)
  const orgAdmin = orgRole === 'owner' || orgRole === 'admin'
  return {
    manageSettings: admin,
    createWorkspace: admin,
    manageMembers: admin,
    manageKeys: admin,
    manageVariables: admin,
    toggleLock: admin,
    delete: !admin.allowed ? admin : locked ? no(REASONS.lockFirst) : YES,
    // A project admin can't take the project out of an org they don't run, and the
    // deletion lock keeps it where it is: a move removes it from the org.
    move: !orgAdmin ? no(REASONS.orgAdmins) : locked ? no(REASONS.lockFirst) : YES,
  }
}

export interface WorkspaceFacts {
  ownLock: boolean
  /** The project's name when the project's lock covers this workspace. */
  lockedByProject: string | null
  isLastWorkspace: boolean
  /** Another workspace calls one of its shared items. */
  sharedInUse: boolean
}

export function workspaceCapabilities(
  role: WorkspaceRole,
  facts: WorkspaceFacts,
): Capabilities<WorkspaceCapability> {
  const editor = role === 'viewer' ? no(REASONS.needsEditor) : YES
  const admin = role === 'admin' ? YES : no(REASONS.workspaceAdmins)
  const toggleLock =
    role === 'viewer'
      ? no(REASONS.lockToggle)
      : facts.lockedByProject
        ? no(REASONS.lockedBy(facts.lockedByProject))
        : YES
  const deleteWorkspace = !admin.allowed
    ? admin
    : facts.lockedByProject
      ? no(REASONS.lockedBy(facts.lockedByProject))
      : facts.ownLock
        ? no(REASONS.lockFirst)
        : facts.isLastWorkspace
          ? no(REASONS.lastWorkspace)
          : facts.sharedInUse
            ? no(REASONS.sharedInUse)
            : YES
  return {
    edit: editor,
    deploy: editor,
    run: YES,
    share: role === 'viewer' ? no(REASONS.shareNeedsEditor) : YES,
    manageSettings: admin,
    manageMembers: admin,
    manageKeys: admin,
    manageVariables: admin,
    toggleLock,
    delete: deleteWorkspace,
  }
}
