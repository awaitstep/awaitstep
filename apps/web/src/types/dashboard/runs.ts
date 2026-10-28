import type { RunSummary } from '../../lib/api-client'
import type { ItemKind } from './items'

export type RunResult = 'succeeded' | 'failed' | 'running'

export type RunTrigger = 'webhook' | 'schedule' | 'http' | 'manual'

export type RunPeriod = '24h' | '7d' | '30d'

/** One run of a workflow, or one request to a function, in a workspace's Runs list. */
export interface WorkspaceRun extends Pick<RunSummary, 'id' | 'workflowId' | 'createdAt'> {
  workflowName: string
  kind: ItemKind
  result: RunResult
  /** Null when the run's trigger isn't recorded (the API doesn't keep it yet). */
  trigger: RunTrigger | null
  /** Null while it is still running. */
  durationMs: number | null
  /** The step a running workflow waits on, e.g. "Wait 1 day". */
  waitingOn: string | null
  /** A function's response, e.g. 200. */
  httpStatus: number | null
  /** Where a failed run stopped and why; the step is null when only the error is known. */
  failure: { step: string | null; message: string } | null
}

export interface RunFilter {
  result?: RunResult
  period?: RunPeriod
  /** Matches the workflow name or the run ID. */
  search?: string
  cursor?: string
  limit?: number
}

export interface RunPage {
  data: WorkspaceRun[]
  nextCursor: string | null
  /** Runs matching the period and search, per result, for the filter pills. */
  counts: Record<RunResult | 'all', number>
}

/** A workflow whose latest run failed, for the org home's "Failing now". */
export interface FailingItem {
  item: { id: string; name: string; kind: ItemKind }
  project: { slug: string; name: string }
  workspace: { slug: string; name: string }
  run: WorkspaceRun
}
