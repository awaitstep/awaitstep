import { BAD_EVENT_TYPE, BAD_INSTANCE_ID, isEventType, isInstanceId } from '@awaitstep/codegen'
import type { TestRunStep } from '@awaitstep/codegen'
import type { RunStep, RunStepExtras } from '../api-client'
import { buildStepList, type StepListEntry } from '../run-step-list'
import { buildRunTimeline, graphShapeOf, isTerminalRunStatus } from '../run-steps'
import { parseTriggerPayload, type InstanceStatusBody } from './session-log'

/** What the stream last said of one instance: its status, and its steps where the runner keeps them. */
export interface InstanceView extends InstanceStatusBody {
  steps?: TestRunStep[]
  /** Earlier steps of this instance were not kept. */
  stepsIncomplete?: boolean
}

/** An instance the Instance pane can pick. */
export interface KnownInstance {
  id: string
  view?: InstanceView
}

/** How many instances the picker lists; the runner keeps steps for as many. */
export const MAX_KNOWN_INSTANCES = 20

/** The list with this instance first, once; the oldest go past the cap. */
export function rememberInstance(list: readonly KnownInstance[], id: string): KnownInstance[] {
  const known = list.find((instance) => instance.id === id)
  const rest = list.filter((instance) => instance.id !== id)
  return [known ?? { id }, ...rest].slice(0, MAX_KNOWN_INSTANCES)
}

/** An instance's view out of an `instance` stream event, or null for a body that says nothing. */
export function instanceViewOf(body: unknown): InstanceView | null {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return null
  const record = body as Record<string, unknown>
  const view: InstanceView = {}
  if (typeof record['status'] === 'string') view.status = record['status']
  if ('output' in record) view.output = record['output']
  if (record['error'] !== undefined) view.error = record['error'] as InstanceView['error']
  if (Array.isArray(record['steps'])) view.steps = record['steps'] as TestRunStep[]
  if (record['stepsIncomplete'] === true) view.stepsIncomplete = true
  return view
}

const stepId = (step: TestRunStep) => `${step.kind}:${step.name}:${step.index}`

/** A test step as a run page row; the run page names its steps by label, as here. */
export function runStepOf(step: TestRunStep, instanceId: string): RunStep {
  const at = step.end ?? step.start ?? new Date(0).toISOString()
  return {
    id: stepId(step),
    runId: instanceId,
    nodeId: null,
    stepName: step.name,
    kind: step.kind,
    stepIndex: step.index,
    status: step.status,
    attemptCount: step.attemptCount,
    error: step.error ? JSON.stringify(step.error) : null,
    startedAt: step.start ?? null,
    endedAt: step.end ?? null,
    createdAt: step.start ?? at,
    updatedAt: at,
  }
}

/** The step panel's output and tries, from the record itself (a test run has no step endpoint). */
export function stepExtrasOf(step: TestRunStep): RunStepExtras {
  const truncated = step.outputTruncated === true
  return {
    output: truncated || step.output === undefined ? null : step.output,
    outputTruncated: truncated,
    outputPreview: truncated && typeof step.output === 'string' ? step.output : null,
    attempts: step.attempts ?? [],
  }
}

/** The test step behind a run page row, by the row's id. */
export function testStepById(
  steps: readonly TestRunStep[] | undefined,
  id: string | undefined,
): TestRunStep | undefined {
  return id ? steps?.find((step) => stepId(step) === id) : undefined
}

interface GraphNode {
  id: string
  name: string
  type: string
  data?: Record<string, unknown>
}

/**
 * The run page's step list for a test instance: one row a step on a time
 * axis, a loop's iterations folded, named after the graph's nodes.
 */
export function instanceStepList(
  view: InstanceView | undefined,
  instanceId: string,
  graph: { nodes: GraphNode[]; edges: unknown[] } | null,
  now: Date = new Date(),
): { entries: StepListEntry[]; spanMs: number } {
  const steps = (view?.steps ?? []).map((step) => runStepOf(step, instanceId))
  const status = view?.status ?? 'running'
  const lastEnd = steps.reduce<string | null>(
    (latest, step) => (step.endedAt && (!latest || step.endedAt > latest) ? step.endedAt : latest),
    null,
  )
  const timeline = buildRunTimeline(
    steps,
    { status, endedAt: isTerminalRunStatus(status) ? lastEnd : null },
    now,
  )
  const shape = graph ? graphShapeOf(graph as Parameters<typeof graphShapeOf>[0]) : null
  const entries = buildStepList({
    rows: timeline.rows,
    steps,
    runStatus: status,
    nodeNames: Object.fromEntries((graph?.nodes ?? []).map((node) => [node.id, node.name])),
    containment: shape?.containment ?? new Map(),
    types: shape?.types ?? new Map(),
  })
  return { entries, spanMs: timeline.spanMs }
}

/** The event types the workflow's Wait for Event steps wait for, as the send form suggests them. */
export function waitEventTypes(graph: { nodes: GraphNode[] } | null): string[] {
  const types = new Set<string>()
  for (const node of graph?.nodes ?? []) {
    const type = node.type === 'wait_for_event' ? node.data?.['eventType'] : undefined
    if (typeof type === 'string' && type.trim() !== '') types.add(type.trim())
  }
  return [...types]
}

/** The line Output gets for an event sent from the Instance pane. */
export function sentEventLine(type: string, instanceId: string, timestamp: number) {
  return {
    timestamp,
    stream: 'stdout' as const,
    text: `Sent event "${type}" to ${instanceId}`,
  }
}

export type EventForm = { ok: true; type: string; payload: unknown } | { ok: false; error: string }

/** The send-event form as a request, or why it can't be sent, judged as the server does. */
export function parseEventForm(typeText: string, payloadText: string): EventForm {
  const type = typeText.trim()
  if (!isEventType(type)) return { ok: false, error: type ? BAD_EVENT_TYPE : 'Enter an event type' }
  const payload = parseTriggerPayload(payloadText)
  if (!payload.ok) return payload
  return { ok: true, type, payload: payload.value }
}

/** A pasted instance id, trimmed, or why it is not one. */
export function parseInstanceId(
  text: string,
): { ok: true; id: string } | { ok: false; error: string } {
  const id = text.trim()
  return isInstanceId(id) ? { ok: true, id } : { ok: false, error: BAD_INSTANCE_ID }
}

/** The status a picker row or the status band reads. */
export function instanceStatusLabel(view: InstanceView | undefined): string {
  if (!view) return 'Not read yet'
  if (view.error === 'instance.not_found') return 'Not in this session'
  switch (view.status) {
    case 'queued':
      return 'Queued'
    case 'running':
      return 'Running'
    case 'waiting':
      return 'Waiting'
    case 'paused':
      return 'Paused'
    case 'complete':
      return 'Complete'
    case 'errored':
      return 'Errored'
    case 'terminated':
      return 'Terminated'
    default:
      return view.status ?? 'Unknown'
  }
}
