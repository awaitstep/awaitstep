import type { ProjectRole, WorkspaceChip } from './projects'
import type { WorkspaceRef } from './items'
import type { OrgRole, Person } from './session'
import type { WorkspaceRole } from './workspaces'

// Dashboard types for one person's access. Web-only until B2 moves them.

/** A project as the access editor lists it, with every workspace in it. */
export interface AccessProject {
  id: string
  name: string
  initial: string
  workspaces: WorkspaceChip[]
}

/**
 * The access editor's working state. Workspace roles under a project that has
 * a role are kept while editing (switching the project role back restores
 * them) but are covered, and never saved.
 */
export interface AccessDraft {
  orgRole: OrgRole
  projects: Record<string, ProjectRole | null>
  workspaces: Record<string, WorkspaceRole | null>
}

/** What saving the access editor sends. */
export interface AccessGrant {
  orgRole: OrgRole
  projects: { projectId: string; role: ProjectRole }[]
  workspaces: { workspaceId: string; role: WorkspaceRole }[]
}

/** A Viewer's ask for edit access to a workspace, sent to one of its admins. */
export interface EditRequest {
  id: string
  workspaceId: string
  from: { id: string; name: string }
  to: { id: string; name: string }
  at: string
}

/** How someone reaches every workspace in a project. */
export type ProjectWideRole = 'owner' | 'org-admin' | 'project-admin' | 'project-member'

/** Project settings → Members, in the board's two groups. */
export interface ProjectMembers {
  /** Can open every workspace: org owners and admins, and the project's own members. */
  wholeProject: { person: Person; role: ProjectWideRole }[]
  /** Can open only the workspaces listed (only ones the viewer can open are shown). */
  workspacesOnly: {
    person: Person
    workspaces: { workspace: WorkspaceRef; role: WorkspaceRole }[]
  }[]
}
