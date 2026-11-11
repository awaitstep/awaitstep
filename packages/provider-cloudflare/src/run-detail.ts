import type { RunStepDetail, RunStepDetailKind, WorkflowRunDetail } from '@awaitstep/codegen'
import type { CFInstanceStatus, CFInstanceStep } from './api.js'
import { mapCFStatus } from './status-map.js'

const KIND_BY_CF_TYPE: Record<string, RunStepDetailKind> = {
  step: 'do',
  rollback: 'rollback',
  sleep: 'sleep',
  waitForEvent: 'waitForEvent',
}

function stepStatus(step: CFInstanceStep, kind: RunStepDetailKind): RunStepDetail['status'] {
  if (kind === 'do' || kind === 'rollback') {
    if (step.success === true) return 'complete'
    if (step.end && step.success === false) return 'errored'
    return 'running'
  }
  // sleep / waitForEvent report `finished`; while pending they hold the
  // instance in a waiting state, not an active one.
  if (step.finished) return step.error ? 'errored' : 'complete'
  return 'waiting'
}

function lastAttemptError(step: CFInstanceStep): { name: string; message: string } | undefined {
  if (step.error) return step.error
  const failed = [...(step.attempts ?? [])].reverse().find((a) => a.error)
  return failed?.error ?? undefined
}

/**
 * Maps the instance-describe `steps` array to provider-agnostic step
 * details. Termination entries carry no name and are dropped; `index` is the
 * 1-based occurrence per (name, kind) in report order — the same count
 * Cloudflare uses to address repeated labels (loops) in `restart from`.
 */
export function mapInstanceSteps(steps: CFInstanceStep[] | undefined): RunStepDetail[] {
  const occurrences = new Map<string, number>()
  const details: RunStepDetail[] = []
  for (const step of steps ?? []) {
    const kind = KIND_BY_CF_TYPE[step.type]
    if (!kind || !step.name) continue
    const key = `${kind}\u0000${step.name}`
    const index = (occurrences.get(key) ?? 0) + 1
    occurrences.set(key, index)
    const error = lastAttemptError(step)
    details.push({
      name: step.name,
      kind,
      index,
      status: stepStatus(step, kind),
      ...(step.start && { start: step.start }),
      ...(step.end && { end: step.end }),
      attemptCount: step.attempts?.length ?? 1,
      ...(error && { error }),
      ...(step.output !== undefined && step.output !== null && { output: step.output }),
      ...(step.attempts?.length && {
        attempts: step.attempts.map((a) => ({
          ...(a.start && { start: a.start }),
          ...(a.end && { end: a.end }),
          ...(a.error && { error: a.error }),
        })),
      }),
    })
  }
  return details
}

/** Full instance detail (status + per-step telemetry) from a describe response. */
export function toRunDetail(status: CFInstanceStatus): WorkflowRunDetail {
  return {
    instanceId: status.id,
    status: mapCFStatus(status.status),
    output: status.output,
    error: status.error,
    ...(status.start && { startedAt: status.start }),
    ...(status.end && { endedAt: status.end }),
    ...(status.step_count !== undefined && { stepCount: status.step_count }),
    steps: mapInstanceSteps(status.steps),
  }
}
