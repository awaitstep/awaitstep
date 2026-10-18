import type { RunStepDetail, WorkflowRunDetail } from '@awaitstep/codegen'

export type RunStreamEvent =
  | { event: 'run'; data: { status: string } }
  | {
      event: 'step'
      data: Pick<RunStepDetail, 'name' | 'kind' | 'index' | 'status' | 'attemptCount'>
    }

// Labels are node ids plus optional ` [n]` / `--suffix` decorations, none of
// which contain '|', so it is a safe composite-key separator.
function stepKey(step: RunStepDetail): string {
  return `${step.kind}|${step.name}|${step.index}`
}

/**
 * Events worth pushing to a live viewer between two provider snapshots:
 * a run status change, and every step whose status or attempt count moved
 * (new steps included). Unchanged steps emit nothing, so a quiet tick costs
 * the viewer no work.
 */
export function diffRunDetail(
  previous: WorkflowRunDetail | null,
  current: WorkflowRunDetail,
): RunStreamEvent[] {
  const events: RunStreamEvent[] = []
  if (!previous || previous.status !== current.status) {
    events.push({ event: 'run', data: { status: current.status } })
  }
  const before = new Map((previous?.steps ?? []).map((s) => [stepKey(s), s]))
  for (const step of current.steps) {
    const prior = before.get(stepKey(step))
    if (prior && prior.status === step.status && prior.attemptCount === step.attemptCount) continue
    events.push({
      event: 'step',
      data: {
        name: step.name,
        kind: step.kind,
        index: step.index,
        status: step.status,
        attemptCount: step.attemptCount,
      },
    })
  }
  return events
}
