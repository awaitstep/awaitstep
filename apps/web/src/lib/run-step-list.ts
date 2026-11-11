import type { RunStep } from './api-client'
import {
  isInterruptedStep,
  isTerminalRunStatus,
  isTimedOutWait,
  type Containment,
  type TimelineRow,
} from './run-steps'

/** How a step row reads on the run page (26a–26c). */
export type StepRowState = 'done' | 'failed' | 'waiting' | 'running' | 'timedOut' | 'interrupted'

export interface StepItem {
  kind: 'step'
  id: string
  /** The node's name when the step maps to one, else its label. */
  name: string
  /** The provider's label, e.g. `hbd0uwviy1_w-1`. */
  label: string
  state: StepRowState
  row: TimelineRow
  step: RunStep
}

/** One node's repeated steps — a loop's iterations — folded into one row. */
export interface StepGroup {
  kind: 'group'
  id: string
  nodeId: string
  name: string
  /** "loop · 24 iterations", or "3 runs" outside a loop. */
  meta: string
  state: StepRowState
  startOffsetMs: number
  durationMs: number
  items: StepItem[]
}

export type StepListEntry = StepItem | StepGroup

export function stepRowState(step: RunStep, runStatus: string): StepRowState {
  if (isTimedOutWait(step)) return 'timedOut'
  if (isInterruptedStep(step, runStatus)) return 'interrupted'
  switch (step.status) {
    case 'complete':
      return 'done'
    case 'errored':
      return 'failed'
    case 'waiting':
      return 'waiting'
    default:
      return 'running'
  }
}

const GROUP_RANK: Record<StepRowState, number> = {
  failed: 5,
  running: 4,
  waiting: 3,
  interrupted: 2,
  timedOut: 1,
  done: 0,
}

interface StepListInput {
  rows: TimelineRow[]
  steps: RunStep[]
  runStatus: string
  /** Node id → its name. */
  nodeNames: Record<string, string>
  /** Which container each node sits in, to call a loop's repeats iterations. */
  containment: Containment
  /** Node id → its type. */
  types: ReadonlyMap<string, string>
}

/**
 * The run's steps in start order, a node's repeated steps (a loop's
 * iterations) folded into one group at the first one's place.
 */
export function buildStepList({
  rows,
  steps,
  runStatus,
  nodeNames,
  containment,
  types,
}: StepListInput): StepListEntry[] {
  const byId = new Map(steps.map((s) => [s.id, s]))
  const items: StepItem[] = rows.flatMap((row) => {
    const step = byId.get(row.id)
    if (!step) return []
    return [
      {
        kind: 'step' as const,
        id: row.id,
        name: (row.nodeId && nodeNames[row.nodeId]) || row.label,
        label: row.label,
        state: stepRowState(step, runStatus),
        row,
        step,
      },
    ]
  })

  const perNode = new Map<string, StepItem[]>()
  for (const item of items) {
    if (!item.row.nodeId) continue
    const list = perNode.get(item.row.nodeId) ?? []
    list.push(item)
    perNode.set(item.row.nodeId, list)
  }

  const placed = new Set<string>()
  const entries: StepListEntry[] = []
  for (const item of items) {
    const nodeId = item.row.nodeId
    const repeats = nodeId ? perNode.get(nodeId)! : [item]
    if (repeats.length < 2) {
      entries.push(item)
      continue
    }
    if (placed.has(nodeId!)) continue
    placed.add(nodeId!)
    entries.push(groupOf(nodeId!, repeats, nodeNames, containment, types))
  }
  return entries
}

function groupOf(
  nodeId: string,
  items: StepItem[],
  nodeNames: Record<string, string>,
  containment: Containment,
  types: ReadonlyMap<string, string>,
): StepGroup {
  const start = Math.min(...items.map((i) => i.row.startOffsetMs))
  const end = Math.max(...items.map((i) => i.row.startOffsetMs + i.row.durationMs))
  const state = items.reduce<StepRowState>(
    (worst, i) => (GROUP_RANK[i.state] > GROUP_RANK[worst] ? i.state : worst),
    'done',
  )
  const inLoop = types.get(nodeId) === 'loop' || containment.get(nodeId)?.type === 'loop'
  return {
    kind: 'group',
    id: `group:${nodeId}`,
    nodeId,
    name: nodeNames[nodeId] || items[0]!.label,
    meta: inLoop ? `loop · ${items.length} iterations` : `${items.length} runs`,
    state,
    startOffsetMs: start,
    durationMs: end - start,
    items,
  }
}

/** Every step, groups opened. */
export function flatSteps(entries: StepListEntry[]): StepItem[] {
  return entries.flatMap((e) => (e.kind === 'group' ? e.items : [e]))
}

/** Only failed steps; a group keeps just its failed iterations. */
export function failedOnly(entries: StepListEntry[]): StepListEntry[] {
  return entries.flatMap((entry): StepListEntry[] => {
    if (entry.kind === 'step') return entry.state === 'failed' ? [entry] : []
    const items = entry.items.filter((i) => i.state === 'failed')
    return items.length > 0 ? [{ ...entry, items }] : []
  })
}

/**
 * The step a page opens on: where a failed run stopped, where a live run is,
 * else its last step.
 */
export function focusStep(items: StepItem[], runStatus: string): StepItem | undefined {
  const last = (keep: (i: StepItem) => boolean) => items.filter(keep).at(-1)
  if (runStatus === 'errored') return last((i) => i.state === 'failed') ?? items.at(-1)
  if (!isTerminalRunStatus(runStatus)) {
    return last((i) => i.state === 'running' || i.state === 'waiting') ?? items.at(-1)
  }
  return items.at(-1)
}

/** The line under the run's duration: where it is or where it stopped. */
export function runWhereabouts(items: StepItem[], runStatus: string): string {
  switch (runStatus) {
    case 'errored': {
      const at = items.filter((i) => i.state === 'failed').at(-1)
      return at ? `Stopped at ${at.name}` : 'Failed'
    }
    case 'complete':
      return 'Finished'
    case 'terminated':
      return 'Terminated'
    case 'paused':
      return 'Paused'
    case 'queued':
      return 'Queued'
  }
  const now = items.filter((i) => i.state === 'running' || i.state === 'waiting').at(-1)
  if (!now) return 'Starting'
  if (now.step.kind === 'waitForEvent') return 'Waiting for an event'
  if (now.step.kind === 'sleep') return `Sleeping at ${now.name}`
  return `At ${now.name}`
}
