import type { WorkspaceColour } from '../../components/ui/workspace-colour'
import type { LockState } from './locks'
import type { Person } from './session'

export type WorkspaceRole = 'admin' | 'editor' | 'viewer'

/** Someone who can open a workspace, with their effective role there. */
export interface WorkspacePerson {
  person: Person
  role: WorkspaceRole
  /** The role comes from the project or org ("Project admin"), not the workspace itself. */
  inherited: boolean
  /** When they last opened the org: "Active 2h ago". */
  lastActiveAt: string | null
  /**
   * The role the project alone gives them (project admin → admin, member →
   * editor). A grant here only counts above it, and removing the grant leaves it.
   */
  projectRole: WorkspaceRole | null
  /** Org owners and admins open every workspace through the org, not the project. */
  orgRole: 'owner' | 'admin' | null
}

export interface Workspace {
  id: string
  projectId: string
  slug: string
  name: string
  initial: string
  description: string | null
  colour: WorkspaceColour
  /** Everyone who can open it: its own members and those it inherits. */
  people: Person[]
  createdAt: string
  createdBy: { id: string; name: string }
  lock: LockState
  counts: WorkspaceCounts
}

export interface WorkspaceCounts {
  workflows: number
  /** Workflows with a deployed version. */
  deployed: number
  functions: number
  /** Its items shared to the project. */
  sharedOut: number
  runs24h: number
  /** Items whose latest run failed. */
  failing: number
  lastRunAt: string | null
}

export type NewWorkspaceAccess =
  { kind: 'admins' } | { kind: 'pick'; people: { userId: string; role: WorkspaceRole }[] }

export interface NewWorkspaceInput {
  name: string
  colour: WorkspaceColour
  description?: string
  access: NewWorkspaceAccess
}

export interface WorkspaceUpdate {
  name?: string
  slug?: string
  description?: string | null
  colour?: WorkspaceColour
}
