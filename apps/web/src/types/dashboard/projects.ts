import type { ProjectSummary } from '../../lib/api-client'
import type { WorkspaceColour } from '../../components/ui/workspace-colour'
import type { LockState } from './locks'
import type { Person } from './session'

export type ProjectRole = 'admin' | 'member'

export interface WorkspaceChip {
  id: string
  slug: string
  name: string
  colour: WorkspaceColour
}

export interface Project extends ProjectSummary {
  initial: string
  /** Only the workspaces the viewer can open. */
  workspaces: WorkspaceChip[]
  /** Everyone in the workspaces the viewer can open (hidden ones reveal no one). */
  people: Person[]
  lock: LockState
  /** Over the workspaces the viewer can open: "1 failing · 5m ago", "All passing · 3h ago". */
  health: { workflows: number; failing: number; lastRunAt: string | null }
}

export interface NewProjectInput {
  name: string
  description?: string
}

export interface ProjectUpdate {
  name?: string
  slug?: string
  description?: string | null
}
