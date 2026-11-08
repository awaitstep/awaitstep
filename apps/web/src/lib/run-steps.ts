import { stepLabelBase } from '@awaitstep/codegen'
import type { StepStatus } from '../stores/run-overlay-store'
import type { RunStep, RunStepStatus } from './api-client'

const TERMINAL_RUN_STATUSES = new Set(['complete', 'errored', 'terminated'])

export function isTerminalRunStatus(runStatus: string): boolean {
  return TERMINAL_RUN_STATUSES.has(runStatus)
}

function isInFlight(step: RunStep): boolean {
  return (step.status === 'running' || step.status === 'waiting') && !step.endedAt
}

/**
 * A step still marked in-flight after its run ended was interrupted (the
 * instance errored or was terminated mid-step) — the provider never writes
 * an end for it, and the sync loop stops revisiting terminal runs. Such a
 * step must not keep animating or growing.
 */
export function isInterruptedStep(step: RunStep, runStatus: string): boolean {
  return isTerminalRunStatus(runStatus) && isInFlight(step)
}

export function stepToNodeStatus(status: RunStepStatus): StepStatus {
  switch (status) {
    case 'complete':
      return 'complete'
    case 'errored':
      return 'errored'
    default:
      // running and waiting (sleep / waitForEvent in progress) both animate.
      return 'running'
  }
}

const STATUS_RANK: Record<StepStatus, number> = {
  errored: 4,
  running: 3,
  complete: 2,
  pending: 1,
  skipped: 0,
}

/**
 * Folds provider step records onto canvas nodes for the run overlay. A node
 * with several records (loop iterations) shows its most urgent status
 * (errored > running > complete). Coalesced members mirror their leader.
 * Nodes without any record are pending while the run is active and left
 * unstyled once it is terminal — control-flow nodes, inline steps and lean
 * members legitimately never report a durable step, so dimming them as
 * "skipped" would misread normal runs. Interrupted steps read as pending
 * rather than running once the run is over.
 */
export function mapRunStepsToNodeStatuses(
  nodeIds: string[],
  steps: RunStep[],
  coalescedInto: Record<string, string>,
  runStatus: string,
): Record<string, StepStatus> {
  const known = new Set(nodeIds)
  const byNode = new Map<string, StepStatus>()
  for (const step of steps) {
    const nodeId = step.nodeId ?? stepLabelBase(step.stepName)
    if (!known.has(nodeId)) continue
    const next = isInterruptedStep(step, runStatus) ? 'pending' : stepToNodeStatus(step.status)
    const prev = byNode.get(nodeId)
    if (!prev || STATUS_RANK[next] > STATUS_RANK[prev]) byNode.set(nodeId, next)
  }
  for (const [member, leader] of Object.entries(coalescedInto)) {
    const leaderStatus = byNode.get(leader)
    if (leaderStatus && known.has(member) && !byNode.has(member)) byNode.set(member, leaderStatus)
  }

  const statuses: Record<string, StepStatus> = {}
  const active = !isTerminalRunStatus(runStatus)
  for (const id of nodeIds) {
    const status = byNode.get(id)
    if (status) statuses[id] = status
    else if (active) statuses[id] = 'pending'
  }
  return statuses
}

export interface TimelineRow {
  id: string
  label: string
  nodeId: string | null
  kind: RunStep['kind']
  status: RunStepStatus
  /** In flight when the run ended — never finished, never will. */
  interrupted: boolean
  attemptCount: number
  error: string | null
  /** Offset from the run's first step start, in ms. */
  startOffsetMs: number
  /** Measured duration; still growing for in-flight steps of an active run. */
  durationMs: number
}

export interface RunTimeline {
  rows: TimelineRow[]
  /** Width of the whole run window the bars are laid out against. */
  spanMs: number
  /** Every durable step the provider bills for (do, sleep, waitForEvent, rollback). */
  billableSteps: number
}

export interface TimelineRunContext {
  status: string
  /** When the run ended (its last update) — caps interrupted steps. */
  endedAt: string | null
}

/**
 * Lays provider step records out on one time axis anchored at the earliest
 * step start. In-flight steps of an active run extend to `now`; in-flight
 * steps of a finished run are capped at the run's end and flagged
 * interrupted. A step without a start has no measurable timing at all (an
 * end alone would be measured from the run origin), so it sits at offset 0
 * with zero width but still lists.
 */
export function buildRunTimeline(
  steps: RunStep[],
  run: TimelineRunContext,
  now: Date = new Date(),
): RunTimeline {
  const nowMs = now.getTime()
  const terminal = isTerminalRunStatus(run.status)
  const runEndMs = run.endedAt ? new Date(run.endedAt).getTime() : nowMs
  const starts = steps.flatMap((s) => (s.startedAt ? [new Date(s.startedAt).getTime()] : []))
  const origin = starts.length > 0 ? Math.min(...starts) : nowMs
  let end = origin
  const rows: TimelineRow[] = steps.map((step) => {
    const interrupted = isInterruptedStep(step, run.status)
    const start = step.startedAt ? new Date(step.startedAt).getTime() : origin
    let stop = start
    if (step.startedAt) {
      if (step.endedAt) stop = new Date(step.endedAt).getTime()
      else if (isInFlight(step)) stop = terminal ? Math.max(start, runEndMs) : nowMs
    }
    end = Math.max(end, stop)
    return {
      id: step.id,
      label: step.stepName,
      nodeId: step.nodeId,
      kind: step.kind,
      status: step.status,
      interrupted,
      attemptCount: step.attemptCount,
      error: step.error,
      startOffsetMs: Math.max(0, start - origin),
      durationMs: Math.max(0, stop - start),
    }
  })
  rows.sort((a, b) => a.startOffsetMs - b.startOffsetMs)
  return { rows, spanMs: Math.max(1, end - origin), billableSteps: steps.length }
}
