import type { RunResult, RunTrigger, WorkspaceRun } from '../../types/dashboard/runs'
import { ITEM_KIND_LABEL } from '../items/item-kind'

// How runs read on the workspace Overview and Runs boards: "Failed",
// "200 OK", "Webhook", "4.2s", "waiting on step "Wait 1 day"".

export const RESULT_LABEL: Record<RunResult, string> = {
  succeeded: 'Succeeded',
  failed: 'Failed',
  running: 'Running',
}

/** The dot beside the result word. */
export const RESULT_DOT_CLASS: Record<RunResult, string> = {
  succeeded: 'bg-status-success',
  failed: 'bg-status-error',
  running: 'bg-status-warning',
}

/**
 * "Succeeded", "Failed", "Running". With `httpStatus`, a function's request
 * that succeeded reads as its response, "200 OK", as `WsOverview` draws it.
 */
export function resultLabel(run: WorkspaceRun, options: { httpStatus?: boolean } = {}): string {
  if (options.httpStatus && run.result === 'succeeded' && run.httpStatus === 200) return '200 OK'
  if (options.httpStatus && run.result === 'succeeded' && run.httpStatus !== null) {
    return String(run.httpStatus)
  }
  return RESULT_LABEL[run.result]
}

const TRIGGER_LABEL: Record<RunTrigger, string> = {
  webhook: 'Webhook',
  schedule: 'Schedule',
  http: 'HTTP',
  manual: 'Manual',
}

export function triggerLabel(trigger: RunTrigger | null): string {
  return trigger ? TRIGGER_LABEL[trigger] : '—'
}

/** "Workflow", "Function", or for a run that waits, "Workflow · waiting on step "Wait 1 day"". */
export function runKindLabel(run: WorkspaceRun): string {
  const kind = ITEM_KIND_LABEL[run.kind]
  return run.waitingOn ? `${kind} · waiting on step “${run.waitingOn}”` : kind
}

/** "86ms", "4.2s", "1m 12s", or "—" while it runs. */
export function tookLabel(durationMs: number | null): string {
  if (durationMs === null) return '—'
  // Round first, then pick the unit, so 999.6ms reads "1.0s" and 59.96s reads "1m 0s".
  const ms = Math.round(durationMs)
  if (ms < 1000) return `${ms}ms`
  const tenths = Math.round(ms / 100)
  if (tenths < 600) return `${(tenths / 10).toFixed(1)}s`
  const seconds = Math.round(ms / 1000)
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}
