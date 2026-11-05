import type { WorkspaceColour } from '../../components/ui/workspace-colour'
import type { LockState } from './locks'
import type { Person } from './session'

import type { RunHour, WorkspaceRole } from '@awaitstep/ir'

export type { RunHour, WorkspaceRole } from '@awaitstep/ir'

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
  /** Null on a Default workspace the migration made: nobody created it. */
  createdBy: { id: string; name: string } | null
  lock: LockState
  counts: WorkspaceCounts
  /** Whether you can build here (Editor or above): where an item may be moved to. */
  viewerCanEdit: boolean
  /** The last 24 hours' runs, oldest first: only on the workspace a page's URL names. */
  runsByHour?: RunHour[]
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
