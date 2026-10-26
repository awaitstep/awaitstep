import type { WorkflowSummary } from '../../lib/api-client'
import type { WorkspaceColour } from '../../components/ui/workspace-colour'
import type { RunResult } from './runs'
import type { Allowed } from './scope'

/** The API's kinds: `'script'` is what the UI calls a Function. */
export type ItemKind = NonNullable<WorkflowSummary['kind']>

export interface WorkspaceRef {
  id: string
  slug: string
  name: string
  colour: WorkspaceColour
}

export interface Sharing {
  sharedAt: string
  sharedBy: { id: string; name: string }
}

/** A function's request traffic over the last 24 hours. */
export interface FunctionTraffic {
  requests: number
  /** 0–1. */
  errorRate: number
  /** Requests per 2-hour bucket, oldest first (12 buckets). */
  buckets: number[]
}

/** A workflow or function on a workspace's Workflows / Functions list. */
export interface WorkspaceItem extends Pick<
  WorkflowSummary,
  'id' | 'name' | 'createdAt' | 'updatedAt'
> {
  kind: ItemKind
  workspaceId: string
  description: string | null
  status: 'deployed' | 'draft'
  /** The deployed version, null for drafts. */
  version: number | null
  /** A function's route, e.g. "POST /crm/sync". */
  route: string | null
  /** The last 10 results, oldest first. */
  recentRuns: RunResult[]
  lastRun: { result: RunResult; at: string } | null
  traffic: FunctionTraffic | null
  sharing: Sharing | null
  /** Other workspaces that call it (shared items only). */
  usedBy: WorkspaceRef[]
  /** Whether the viewer may flip its share switch now, and why not. */
  shareToggle: Allowed
}

/** An item another workspace shared to the project, as the project or a workspace sees it. */
export interface SharedItem extends Sharing {
  id: string
  name: string
  kind: ItemKind
  version: number | null
  from: WorkspaceRef
  usedBy: WorkspaceRef[]
}

export interface MoveItemsInput {
  itemIds: string[]
  /** Slug of the workspace in the same project to move them to. */
  to: string
}
