import type { WorkspaceColour } from '../../components/ui/workspace-colour'

// The org home's "Recent activity". Web-only until B7 (audit) gives a real feed.

export type ActivityKind = 'failed' | 'deployed' | 'shared'

export interface ActivityItem {
  id: string
  kind: ActivityKind
  /** "Lead enrichment failed at step "Fetch company"". */
  title: string
  project: { slug: string; name: string }
  workspace: { slug: string; name: string; colour: WorkspaceColour }
  at: string
}
