import type { WorkspaceRole } from '../types/dashboard/workspaces'

// The one ranking of workspace roles. The fake API and the pages both use it,
// so the role menu never offers a role the server refuses.

const ROLE_RANK: Record<WorkspaceRole, number> = { viewer: 0, editor: 1, admin: 2 }

/** Whether `role` gives more than `than`. */
export function roleAbove(role: WorkspaceRole, than: WorkspaceRole): boolean {
  return ROLE_RANK[role] > ROLE_RANK[than]
}

/**
 * Whether a workspace grant of `role` does anything for someone the project
 * already gives `projectRole`: only a higher role does.
 */
export function grantCounts(role: WorkspaceRole, projectRole: WorkspaceRole | null): boolean {
  return projectRole === null || roleAbove(role, projectRole)
}
