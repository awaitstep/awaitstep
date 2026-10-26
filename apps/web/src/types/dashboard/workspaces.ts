import type { WorkspaceColour } from '../../components/ui/workspace-colour'
import type { LockState } from './locks'
import type { Person } from './session'

export type WorkspaceRole = 'admin' | 'editor' | 'viewer'

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
