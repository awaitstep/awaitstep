import type { WorkspaceColour } from '../../components/ui/workspace-colour'
import type { ItemKind } from './items'

// The org home's "Recent activity", as `GET /orgs/:slug/home-summary` answers it.

export type ActivityKind = 'failed' | 'deployed' | 'shared'

export interface ActivityItem {
  /** The kind and its source row's id: `deployed:<deployment id>`. */
  id: string
  kind: ActivityKind
  workflow: { name: string; kind: ItemKind }
  /** The deployed version's number; null for a failure or a share. */
  version: number | null
  project: { slug: string; name: string }
  workspace: { slug: string; name: string; colour: WorkspaceColour }
  at: string
}
