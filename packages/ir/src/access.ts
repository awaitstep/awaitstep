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
// Until B2 adds project and workspace roles, the org role decides all three
// levels (`rolesFromOrgRole`).

export type OrgRole = 'owner' | 'admin' | 'member'
export type ProjectRole = 'admin' | 'member'
export type WorkspaceRole = 'admin' | 'editor' | 'viewer'

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

/**
 * The project and workspace roles an org role alone gives, before any
 * project or workspace grant exists (B1): owners and admins run everything,
 * every other member builds everywhere.
 */
export function rolesFromOrgRole(orgRole: OrgRole): {
  projectRole: ProjectRole
  workspaceRole: WorkspaceRole
} {
  return isOrgAdmin(orgRole)
    ? { projectRole: 'admin', workspaceRole: 'admin' }
    : { projectRole: 'member', workspaceRole: 'editor' }
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
