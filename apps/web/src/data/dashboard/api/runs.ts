import type {
  ApiFailing,
  ApiRunPage,
  ApiWorkflowRow,
  ApiWorkspaceRun,
} from '../../../lib/dashboard-api'
import type { RunSummary } from '../../../lib/api-client'
import { toSharing } from './sharing'
import type { WorkspaceItem } from '../../../types/dashboard/items'
import type { Allowed } from '../../../types/dashboard/scope'
import type { FailingItem, RunPage, RunResult, WorkspaceRun } from '../../../types/dashboard/runs'

// Runs and workflows as the API lists them → the rows the Runs, Workflows,
// Functions and Overview pages render.

const FAILED = new Set(['errored', 'terminated'])

/** The API's run status → the three results the pages show. */
export function runResult(status: string): RunResult {
  if (status === 'complete') return 'succeeded'
  return FAILED.has(status) ? 'failed' : 'running'
}

function isFinished(status: string): boolean {
  return status === 'complete' || FAILED.has(status)
}

function durationOf(run: RunSummary): number | null {
  if (!isFinished(run.status)) return null
  const ms = new Date(run.updatedAt).getTime() - new Date(run.createdAt).getTime()
  return Number.isFinite(ms) && ms >= 0 ? ms : null
}

export function toWorkspaceRun(
  run: RunSummary,
  item: { name: string; kind: 'workflow' | 'script' },
): WorkspaceRun {
  const result = runResult(run.status)
  return {
    id: run.id,
    workflowId: run.workflowId,
    createdAt: run.createdAt,
    workflowName: item.name,
    kind: item.kind,
    result,
    // The API records no trigger, step, or response yet.
    trigger: null,
    durationMs: durationOf(run),
    waitingOn: null,
    httpStatus: null,
    failure: result === 'failed' ? { step: null, message: run.error ?? 'The run failed' } : null,
  }
}

function fromListed(run: ApiWorkspaceRun): WorkspaceRun {
  return toWorkspaceRun(run, { name: run.workflowName, kind: run.kind })
}

export function toRunPage(page: ApiRunPage): RunPage {
  return { data: page.data.map(fromListed), nextCursor: page.nextCursor, counts: page.counts }
}

export function toFailingItem(failing: ApiFailing): FailingItem {
  return {
    item: failing.workflow,
    project: failing.project,
    workspace: { slug: failing.workspace.slug, name: failing.workspace.name },
    run: toWorkspaceRun(failing.run, failing.workflow),
  }
}

/**
 * A workflow or function on a workspace's list, from the API's status row.
 * `share` is the viewer's `share` capability in the workspace: the switch's state.
 */
export function toWorkspaceItem(row: ApiWorkflowRow, share: Allowed): WorkspaceItem {
  const finished = row.recentRunStatuses.map(runResult)
  return {
    id: row.id,
    name: row.name,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    kind: row.kind ?? 'workflow',
    workspaceId: row.workspaceId,
    description: row.description ?? null,
    status: row.deployStatus === 'success' ? 'deployed' : 'draft',
    version: row.deployedVersion,
    route: null,
    // Oldest first, as the bars are drawn.
    recentRuns: [...finished].reverse(),
    // The latest finished run's result; the time is the latest run's, which is
    // the same run unless one is still going.
    lastRun: finished[0] && row.lastRunAt ? { result: finished[0], at: row.lastRunAt } : null,
    traffic: null,
    sharing: toSharing(row.sharing),
    // Callers arrive with the Call Workflow node; until then nothing blocks unsharing.
    usedBy: [],
    shareToggle: share,
  }
}
