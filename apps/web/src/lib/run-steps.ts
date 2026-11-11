import { stepLabelBase } from '@awaitstep/codegen'
import { buildContainmentMap, type ArtifactIR, type Edge, type WorkflowNode } from '@awaitstep/ir'
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
  errored: 5,
  running: 4,
  timed_out: 3,
  complete: 2,
  pending: 1,
  skipped: 0,
}

/**
 * A wait for an event that gave up: the step reports an error, but the run
 * carries on (down the timeout path, or past the wait), so it reads as timed
 * out rather than failed.
 */
export function isTimedOutWait(step: RunStep): boolean {
  return (
    step.kind === 'waitForEvent' &&
    step.status === 'errored' &&
    /WorkflowTimeoutError|timed out after/i.test(step.error ?? '')
  )
}

/** A node's place inside a branch, parallel, loop or try/catch (from `buildContainmentMap`). */
export type Containment = ReadonlyMap<string, { containerId: string; type: string }>

/**
 * A container's status from its children's: running while any runs; then
 * errored if any failed — except a try/catch, which handled them, so it reads
 * complete once anything in it completed; else complete when any finished.
 */
function rollUp(type: string, children: StepStatus[]): StepStatus | undefined {
  if (children.length === 0) return undefined
  if (children.includes('running')) return 'running'
  const finished = children.some((s) => s === 'complete' || s === 'timed_out')
  if (children.includes('errored')) return type === 'try_catch' && finished ? 'complete' : 'errored'
  if (finished) return 'complete'
  return undefined
}

/** Which container each node of a graph sits in; none when the graph can't be read. */
export function containmentOf(graph: { nodes: WorkflowNode[]; edges: Edge[] }): Containment {
  try {
    // Containment reads only the nodes and edges.
    return buildContainmentMap(graph as unknown as ArtifactIR)
  } catch {
    return new Map()
  }
}

/** What the overlay reads of the workflow's graph: containers, edges and node types. */
export interface RunGraphShape {
  containment: Containment
  edges: ReadonlyArray<{ source: string; target: string; label?: string }>
  types: ReadonlyMap<string, string>
}

export function graphShapeOf(graph: { nodes: WorkflowNode[]; edges: Edge[] }): RunGraphShape {
  return {
    containment: containmentOf(graph),
    edges: graph.edges,
    types: new Map(graph.nodes.map((n) => [n.id, n.type])),
  }
}

const REACHED: ReadonlySet<StepStatus> = new Set(['complete', 'running', 'errored', 'timed_out'])
const DONE: ReadonlySet<StepStatus> = new Set(['complete', 'timed_out'])

/** Nodes in an order where every node comes after all it is reached from; null on a cycle. */
function topoOrder(ids: string[], edges: RunGraphShape['edges']): string[] | null {
  const indegree = new Map(ids.map((id) => [id, 0]))
  const next = new Map<string, string[]>(ids.map((id) => [id, []]))
  for (const e of edges) {
    if (!indegree.has(e.source) || !indegree.has(e.target)) continue
    indegree.set(e.target, indegree.get(e.target)! + 1)
    next.get(e.source)!.push(e.target)
  }
  const queue = ids.filter((id) => indegree.get(id) === 0)
  const order: string[] = []
  while (queue.length > 0) {
    const id = queue.shift()!
    order.push(id)
    for (const to of next.get(id)!) {
      indegree.set(to, indegree.get(to)! - 1)
      if (indegree.get(to) === 0) queue.push(to)
    }
  }
  return order.length === ids.length ? order : null
}

/**
 * The arm a wait for an event took, by how the wait ended: `onTimeout` when
 * it timed out, `onEvent` when the event came. Null when it hasn't ended.
 */
function waitArm(status: StepStatus | undefined): string | null {
  if (status === 'timed_out') return 'onTimeout'
  if (status === 'complete') return 'onEvent'
  return null
}

/**
 * Marks done the nodes that report no step of their own (the entry, inline
 * steps, containers) but certainly ran — from evidence, never a guess:
 * - a node on every path to a node that reported (it dominates it) ran;
 * - a node whose only way in is the arm a wait took (or a plain edge from a
 *   node that ran), with something after it reported, or a run that
 *   completed, ran;
 * - in a run that completed, its entry ran, and a node whose only way in is a
 *   plain edge from a node that ran inherits it.
 * A branch's arms are never inferred: nothing says which one ran.
 */
function inferStepless(
  byNode: Map<string, StepStatus>,
  ids: string[],
  shape: RunGraphShape,
  runStatus: string,
): void {
  const order = topoOrder(ids, shape.edges)
  if (!order) return
  const preds = new Map<string, Array<{ source: string; label?: string }>>(
    ids.map((id) => [id, []]),
  )
  const succs = new Map<string, string[]>(ids.map((id) => [id, []]))
  for (const e of shape.edges) {
    if (!preds.has(e.target) || !succs.has(e.source)) continue
    preds.get(e.target)!.push({ source: e.source, label: e.label })
    succs.get(e.source)!.push(e.target)
  }

  // Dominators, in topological order: a node's are itself plus those common to all its parents.
  const dom = new Map<string, Set<string>>()
  for (const id of order) {
    const ins = preds.get(id)!
    const common: Set<string> = new Set(ins.length > 0 ? dom.get(ins[0]!.source) : [])
    for (const { source } of ins.slice(1)) {
      const d = dom.get(source)!
      for (const x of [...common]) if (!d.has(x)) common.delete(x)
    }
    common.add(id)
    dom.set(id, common)
  }
  for (const [id, status] of [...byNode]) {
    if (!REACHED.has(status)) continue
    for (const d of dom.get(id) ?? []) if (!byNode.has(d)) byNode.set(d, 'complete')
  }

  // Something after it reported: it was passed through.
  const reachedAfter = new Map<string, boolean>()
  for (const id of [...order].reverse()) {
    reachedAfter.set(
      id,
      succs.get(id)!.some((to) => REACHED.has(byNode.get(to)!) || reachedAfter.get(to)),
    )
  }

  const completed = runStatus === 'complete'
  for (const id of order) {
    if (byNode.has(id)) continue
    const ins = preds.get(id)!
    // Where a run starts (the entry): a run that completed went through it.
    if (ins.length === 0) {
      if (completed) byNode.set(id, 'complete')
      continue
    }
    if (ins.length !== 1) continue
    const { source, label } = ins[0]!
    const parent = byNode.get(source)
    if (!parent || !DONE.has(parent)) continue
    const taken =
      shape.types.get(source) === 'wait_for_event' && label !== undefined
        ? label === waitArm(parent)
        : label === undefined
    if (!taken) continue
    if (completed || reachedAfter.get(id)) byNode.set(id, 'complete')
  }
}

function depthOf(id: string, containment: Containment): number {
  let depth = 0
  let at = containment.get(id)
  while (at) {
    depth++
    at = containment.get(at.containerId)
  }
  return depth
}

/**
 * Folds provider step records onto canvas nodes for the run overlay. A node
 * with several records (loop iterations) shows its most urgent status
 * (errored > running > timed out > complete). A wait that timed out reads as
 * timed out, not failed. Coalesced members mirror their leader. With the
 * workflow's containment, containers (branch, parallel, loop, try/catch) take
 * their children's status, and nodes with no step of their own that certainly
 * ran (by the evidence in `inferStepless`) read as done.
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
  shape?: RunGraphShape,
): Record<string, StepStatus> {
  const known = new Set(nodeIds)
  const byNode = new Map<string, StepStatus>()
  for (const step of steps) {
    const nodeId = step.nodeId ?? stepLabelBase(step.stepName)
    if (!known.has(nodeId)) continue
    const next = isInterruptedStep(step, runStatus)
      ? 'pending'
      : isTimedOutWait(step)
        ? 'timed_out'
        : stepToNodeStatus(step.status)
    const prev = byNode.get(nodeId)
    if (!prev || STATUS_RANK[next] > STATUS_RANK[prev]) byNode.set(nodeId, next)
  }
  for (const [member, leader] of Object.entries(coalescedInto)) {
    const leaderStatus = byNode.get(leader)
    if (leaderStatus && known.has(member) && !byNode.has(member)) byNode.set(member, leaderStatus)
  }

  // Nodes that report no step of their own but certainly ran.
  if (shape) inferStepless(byNode, nodeIds, shape, runStatus)

  // Containers report no step of their own: each takes its children's status,
  // innermost first so a loop inside a branch counts toward the branch.
  const containment = shape?.containment
  if (containment) {
    const childrenOf = new Map<string, { type: string; ids: string[] }>()
    for (const [child, { containerId, type }] of containment) {
      const entry = childrenOf.get(containerId) ?? { type, ids: [] }
      entry.ids.push(child)
      childrenOf.set(containerId, entry)
    }
    const deepestFirst = [...childrenOf.keys()].sort(
      (a, b) => depthOf(b, containment) - depthOf(a, containment),
    )
    for (const containerId of deepestFirst) {
      if (!known.has(containerId)) continue
      const { type, ids } = childrenOf.get(containerId)!
      const rolled = rollUp(
        type,
        ids.flatMap((id) => {
          const status = byNode.get(id)
          return status ? [status] : []
        }),
      )
      const own = byNode.get(containerId)
      if (rolled && (!own || STATUS_RANK[rolled] > STATUS_RANK[own]))
        byNode.set(containerId, rolled)
    }
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
      // Rows synced before their label could be matched carry none: the label's base names it.
      nodeId: step.nodeId ?? stepLabelBase(step.stepName),
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
