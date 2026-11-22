import type { RunSummary } from './api-client'

/** A run recorded as a call: AwaitStep's own `call_` id stands in for a provider instance. */
export function isCallRun(run: Pick<RunSummary, 'instanceId'>): boolean {
  return run.instanceId.startsWith('call_')
}
