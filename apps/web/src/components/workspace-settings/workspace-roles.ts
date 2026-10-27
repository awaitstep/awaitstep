import type { WorkspacePerson, WorkspaceRole } from '../../types/dashboard/workspaces'

/** A workspace role as Workspace settings names it. */
export const WORKSPACE_ROLE_LABEL: Record<WorkspaceRole, string> = {
  admin: 'Admin',
  editor: 'Editor',
  viewer: 'Viewer',
}

/** Highest first, as menus and pickers list them. */
export const WORKSPACE_ROLES: readonly WorkspaceRole[] = ['admin', 'editor', 'viewer']

export const WORKSPACE_ROLE_OPTIONS = WORKSPACE_ROLES.map((role) => ({
  value: role,
  label: WORKSPACE_ROLE_LABEL[role],
}))

/**
 * An inherited role reads as where it comes from: "Owner · whole org",
 * "Admin · whole org" (managed in org settings), "Project admin", "Project member".
 */
export function inheritedRoleLabel(
  person: Pick<WorkspacePerson, 'orgRole'> & { role: WorkspaceRole },
): string {
  if (person.orgRole === 'owner') return 'Owner · whole org'
  if (person.orgRole === 'admin') return 'Admin · whole org'
  return person.role === 'admin' ? 'Project admin' : 'Project member'
}
