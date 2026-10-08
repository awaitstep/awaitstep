import type { WorkflowStatus } from '@awaitstep/codegen'

/** Maps a Cloudflare instance status string to the provider-agnostic enum. */
export function mapCFStatus(cfStatus: string): WorkflowStatus {
  const statusMap: Record<string, WorkflowStatus> = {
    queued: 'queued',
    running: 'running',
    paused: 'paused',
    errored: 'errored',
    terminated: 'terminated',
    complete: 'complete',
    waiting: 'waiting',
    waitingForPause: 'running',
  }
  return statusMap[cfStatus] ?? 'unknown'
}
