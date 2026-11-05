import type { RunSummary } from '../../lib/api-client'
import type { RunResult } from '../../types/dashboard/runs'

const FAILED = new Set(['errored', 'terminated'])

/** A run's status as the boards say it: Succeeded, Failed or Running. */
export function runResult(status: string): RunResult {
  if (status === 'complete') return 'succeeded'
  if (FAILED.has(status)) return 'failed'
  // Queued, running, paused or waiting: not over yet.
  return 'running'
}

/** How long a finished run took, in ms; null while it is still going. */
export function runDurationMs(
  run: Pick<RunSummary, 'status' | 'createdAt' | 'updatedAt'>,
): number | null {
  if (runResult(run.status) === 'running') return null
  return Math.max(0, Date.parse(run.updatedAt) - Date.parse(run.createdAt))
}
