// The role table the dashboard IA agreed (O1, O9), and what each role may
// do. The API applies it and hands pages `viewerCan`; the dummy server runs
// the same functions, so a page can't be told one thing by each.
//
// - Org owners and admins open and manage everything.
// - A project admin manages the project and every workspace in it.
// - A project member opens every workspace in the project as an Editor;
//   a workspace role can raise that to Admin.
// - Otherwise a person opens only the workspaces they hold a role in.
// - Viewers read and run; they never edit, deploy or share.
// - A workspace nobody gave you is not found, never "forbidden".
//
// `resolveRoles` is the one statement of that table in code; the database
// adapter renders the same table as SQL (`RoleFields`) and a test holds the
// two to each other.

export type OrgRole = 'owner' | 'admin' | 'member'
export type ProjectRole = 'admin' | 'member'
export type WorkspaceRole = 'admin' | 'editor' | 'viewer'

/** The three places something is set at: keys and variables are both scoped this way. */
export type ScopeLevel = 'organization' | 'project' | 'workspace'

/** What the membership rows say about one person at one workspace. */
export interface RoleGrants {
  /** Null when they are not in the organization. */
  orgRole: OrgRole | null
  /** Their `project_members` row, if any. */
  projectGrant: ProjectRole | null
  /** Their `workspace_members` row, if any. */
  workspaceGrant: WorkspaceRole | null
}

export interface ResolvedRoles {
  orgRole: OrgRole | null
  /** Org owners and admins count as project admins; null for someone with no project role. */
  projectRole: ProjectRole | null
  /**
   * The workspace role the project alone gives (admin → Admin, member →
   * Editor), before any workspace grant. A role equal to it is inherited.
   */
  inheritedWorkspaceRole: WorkspaceRole | null
  /** Their effective role in the workspace; null means it is hidden from them. */
  workspaceRole: WorkspaceRole | null
}

const WORKSPACE_ROLE_RANK: Record<WorkspaceRole, number> = { viewer: 0, editor: 1, admin: 2 }

/** Whether `role` gives more than `than`. */
export function roleAbove(role: WorkspaceRole, than: WorkspaceRole): boolean {
  return WORKSPACE_ROLE_RANK[role] > WORKSPACE_ROLE_RANK[than]
}

/**
 * Whether a workspace grant of `role` does anything for someone the project
 * already gives `inherited`: only a higher role does. A grant at or below is
 * refused, since it would do nothing now and quietly keep them in later.
 */
export function grantCounts(role: WorkspaceRole, inherited: WorkspaceRole | null): boolean {
  return inherited === null || roleAbove(role, inherited)
}

/** Effective project role: org owners and admins are admins of every project. */
export function projectRoleOf(
  orgRole: OrgRole | null,
  projectGrant: ProjectRole | null,
): ProjectRole | null {
  if (orgRole === null) return null
  if (isOrgAdmin(orgRole)) return 'admin'
  return projectGrant
}

/** The workspace role a project role alone gives. */
export function inheritedWorkspaceRole(projectRole: ProjectRole | null): WorkspaceRole | null {
  if (projectRole === 'admin') return 'admin'
  return projectRole === 'member' ? 'editor' : null
}

export function resolveRoles(grants: RoleGrants): ResolvedRoles {
  const projectRole = projectRoleOf(grants.orgRole, grants.projectGrant)
  const inherited = inheritedWorkspaceRole(projectRole)
  let workspaceRole: WorkspaceRole | null
  if (grants.orgRole === null) workspaceRole = null
  else if (inherited === null) workspaceRole = grants.workspaceGrant
  else if (grants.workspaceGrant && roleAbove(grants.workspaceGrant, inherited)) {
    workspaceRole = grants.workspaceGrant
  } else workspaceRole = inherited
  return { orgRole: grants.orgRole, projectRole, inheritedWorkspaceRole: inherited, workspaceRole }
}

/**
 * Whether the project shows up for them at all: through the org, a project
 * role, or a grant in any one of its workspaces.
 */
export function canSeeProject(
  orgRole: OrgRole | null,
  projectGrant: ProjectRole | null,
  hasWorkspaceGrant: boolean,
): boolean {
  if (projectRoleOf(orgRole, projectGrant) !== null) return true
  return orgRole !== null && hasWorkspaceGrant
}

/** Whether the viewer may do something here, and why not when they may not. */
export interface Allowed {
  allowed: boolean
  reason?: string
}

export type OrgCapability = 'createProject' | 'manageSettings' | 'delete'

export type ProjectCapability =
  | 'manageSettings'
  | 'createWorkspace'
  | 'manageMembers'
  | 'manageKeys'
  | 'manageVariables'
  | 'toggleLock'
  | 'delete'
  /** Move the project to another org: the org's owners and admins only. */
  | 'move'

export type WorkspaceCapability =
  | 'edit'
  | 'deploy'
  | 'run'
  | 'share'
  | 'manageSettings'
  | 'manageMembers'
  | 'manageKeys'
  | 'manageVariables'
  | 'toggleLock'
  | 'delete'

export type Capabilities<C extends string> = Record<C, Allowed>

const YES: Allowed = { allowed: true }
const no = (reason: string): Allowed => ({ allowed: false, reason })

export const ACCESS_REASONS = {
  orgAdmins: 'Only org owners and admins can do this',
  orgOwners: 'Only org owners can do this',
  projectsLeft: (n: number) => (n === 1 ? '1 project still in it' : `${n} projects still in it`),
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

export function isOrgAdmin(role: OrgRole | null | undefined): boolean {
  return role === 'owner' || role === 'admin'
}

/** `projectsLeft`: every project still in the org, seen or not; deleting waits for them. */
export function orgCapabilities(role: OrgRole, projectsLeft = 0): Capabilities<OrgCapability> {
  const admin = isOrgAdmin(role)
  return {
    createProject: YES,
    manageSettings: admin ? YES : no(ACCESS_REASONS.orgAdmins),
    delete:
      role !== 'owner'
        ? no(ACCESS_REASONS.orgOwners)
        : projectsLeft > 0
          ? no(ACCESS_REASONS.projectsLeft(projectsLeft))
          : YES,
  }
}

export function projectCapabilities(
  role: ProjectRole | null,
  locked: boolean,
  orgRole: OrgRole | null = null,
): Capabilities<ProjectCapability> {
  const admin = role === 'admin' ? YES : no(ACCESS_REASONS.projectAdmins)
  const orgAdmin = isOrgAdmin(orgRole)
  return {
    manageSettings: admin,
    createWorkspace: admin,
    manageMembers: admin,
    manageKeys: admin,
    manageVariables: admin,
    toggleLock: admin,
    delete: !admin.allowed ? admin : locked ? no(ACCESS_REASONS.lockFirst) : YES,
    // A project admin can't take the project out of an org they don't run, and the
    // deletion lock keeps it where it is: a move removes it from the org.
    move: !orgAdmin ? no(ACCESS_REASONS.orgAdmins) : locked ? no(ACCESS_REASONS.lockFirst) : YES,
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
  const editor = role === 'viewer' ? no(ACCESS_REASONS.needsEditor) : YES
  const admin = role === 'admin' ? YES : no(ACCESS_REASONS.workspaceAdmins)
  const toggleLock =
    role === 'viewer'
      ? no(ACCESS_REASONS.lockToggle)
      : facts.lockedByProject
        ? no(ACCESS_REASONS.lockedBy(facts.lockedByProject))
        : YES
  const deleteWorkspace = !admin.allowed
    ? admin
    : facts.lockedByProject
      ? no(ACCESS_REASONS.lockedBy(facts.lockedByProject))
      : facts.ownLock
        ? no(ACCESS_REASONS.lockFirst)
        : facts.isLastWorkspace
          ? no(ACCESS_REASONS.lastWorkspace)
          : facts.sharedInUse
            ? no(ACCESS_REASONS.sharedInUse)
            : YES
  return {
    edit: editor,
    deploy: editor,
    run: YES,
    share: role === 'viewer' ? no(ACCESS_REASONS.shareNeedsEditor) : YES,
    manageSettings: admin,
    manageMembers: admin,
    manageKeys: admin,
    manageVariables: admin,
    toggleLock,
    delete: deleteWorkspace,
  }
}
