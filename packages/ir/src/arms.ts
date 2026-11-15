import type { ArtifactIR, ValidationError } from './types.js'

/** Nodes whose arms run as blocks of their own: the containers and a wait. */
const ARM_CONTAINER_TYPES: ReadonlySet<string> = new Set([
  'branch',
  'parallel',
  'try_catch',
  'loop',
  'race',
  'wait_for_event',
])

const LABELLED_ARMS: Readonly<Record<string, ReadonlySet<string>>> = {
  loop: new Set(['body']),
  try_catch: new Set(['try', 'catch', 'finally']),
  wait_for_event: new Set(['onEvent', 'onTimeout']),
}

/** The label of the edge a block continues on once its arms are done. */
export const CONTINUE_LABEL = 'then'

/** The wait's arms are stored twice: as labelled edges and as these fields. */
export const WAIT_ARM_FIELDS: Readonly<Record<string, 'onEventNode' | 'onTimeoutNode'>> = {
  onEvent: 'onEventNode',
  onTimeout: 'onTimeoutNode',
}

/** Whether nodes of `type` open arms: a branch, parallel, race, try/catch, loop or wait. */
export function isArmContainerType(type: string): boolean {
  return ARM_CONTAINER_TYPES.has(type)
}

/**
 * The fixed arm labels of a type with named arms (loop, try/catch, wait), or
 * undefined: a branch, parallel or race takes any non-`then` label as an arm.
 */
export function labelledArmsOf(type: string): ReadonlySet<string> | undefined {
  return Object.hasOwn(LABELLED_ARMS, type) ? LABELLED_ARMS[type] : undefined
}

/**
 * Whether an edge leaving a node of `type` with `label` starts one of its
 * arms: a loop's body, a try/catch's try/catch/finally, a wait's
 * onEvent/onTimeout, and any non-`then` edge of a branch, parallel or race.
 * A `then` edge is the container's way on, not an arm.
 */
export function isArmEdgeOf(type: string, label: string | undefined): boolean {
  if (!ARM_CONTAINER_TYPES.has(type)) return false
  const labelled = labelledArmsOf(type)
  if (labelled) return labelled.has(label ?? '')
  return label !== CONTINUE_LABEL
}

/**
 * A place a new node can start on a branching node with nothing there yet:
 * an arm (`label` names it; null is a new unlabelled arm of a parallel or
 * race) or, with `then`, the way on after the block.
 */
export interface OpenArmSlot {
  label: string | null
}

/**
 * The slots of a branching node that have nothing in them: each missing
 * named arm (a loop's body, a try/catch's try/catch/finally, a wait's
 * onEvent/onTimeout, a branch condition with no connection), a new arm for a
 * parallel or race (they take any number), and `then` when nothing follows
 * the block (for a wait: what runs once either arm is done).
 *
 * A wait's arm counts as filled when its selector field names a node that
 * exists, even with no edge: the generated code follows the field.
 */
export function openArmSlots(
  node: { type: string; data: Record<string, unknown> },
  outgoing: readonly { label?: string }[],
  hasNode: (id: string) => boolean,
): OpenArmSlot[] {
  if (!ARM_CONTAINER_TYPES.has(node.type)) return []
  const used = new Set(outgoing.map((edge) => edge.label ?? ''))
  const slots: OpenArmSlot[] = []
  if (node.type === 'wait_for_event') {
    for (const [label, field] of Object.entries(WAIT_ARM_FIELDS)) {
      const selected = node.data[field]
      const viaField = typeof selected === 'string' && selected !== '' && hasNode(selected)
      if (!used.has(label) && !viaField) slots.push({ label })
    }
    if (!used.has(CONTINUE_LABEL)) slots.push({ label: CONTINUE_LABEL })
    return slots
  }
  const named =
    node.type === 'branch'
      ? branchLabels(node.data)
      : node.type === 'parallel' || node.type === 'race'
        ? []
        : [...(labelledArmsOf(node.type) ?? [])]
  for (const label of named) if (!used.has(label)) slots.push({ label })
  if (node.type === 'parallel' || node.type === 'race') slots.push({ label: null })
  if (!used.has(CONTINUE_LABEL)) slots.push({ label: CONTINUE_LABEL })
  return slots
}

/**
 * Whether a wait's arm edge disagrees with its field: the field names some
 * other node that exists. The generated code follows the field, so nothing
 * placed on that edge would run; Code offers no splice there.
 */
export function waitArmEdgeOverridden(
  node: { type: string; data: Record<string, unknown> },
  edge: { label?: string; target: string },
  hasNode: (id: string) => boolean,
): boolean {
  if (node.type !== 'wait_for_event' || edge.label === undefined) return false
  const field = Object.hasOwn(WAIT_ARM_FIELDS, edge.label) ? WAIT_ARM_FIELDS[edge.label] : undefined
  if (field === undefined) return false
  const selected = node.data[field]
  return (
    typeof selected === 'string' && selected !== '' && selected !== edge.target && hasNode(selected)
  )
}

/**
 * The wait with each arm field that names `target` cleared — only the arm
 * `label` names, when given. For an arm edge deleted, or its node removed:
 * a field left behind would keep running a node no longer on that arm.
 * Any other node comes back as is.
 */
export function withoutWaitArmTo<T extends { type: string; data: Record<string, unknown> }>(
  node: T,
  target: string,
  label?: string,
): T {
  if (node.type !== 'wait_for_event') return node
  let data: Record<string, unknown> | null = null
  for (const [armLabel, field] of Object.entries(WAIT_ARM_FIELDS)) {
    if (label !== undefined && armLabel !== label) continue
    if (node.data[field] !== target) continue
    data = { ...(data ?? node.data), [field]: '' }
  }
  return data === null ? node : { ...node, data }
}

/** A branch's condition labels, in order, each once. */
function branchLabels(data: Record<string, unknown>): string[] {
  const branches = Array.isArray(data.branches) ? data.branches : []
  const labels: string[] = []
  for (const branch of branches) {
    const label = (branch as { label?: unknown } | null)?.label
    if (typeof label === 'string' && label !== '' && label !== CONTINUE_LABEL) {
      if (!labels.includes(label)) labels.push(label)
    }
  }
  return labels
}

/** At most this many arm errors are listed; the rest are counted in one more. */
const SHOWN_ARM_ERRORS = 50
/** A label longer than this is cut in the message: labels have no length limit. */
const SHOWN_LABEL_LENGTH = 40

/**
 * An arm whose first node is also reached another way. Generated code runs
 * an arm's first node inside that arm, so the node would run on that arm
 * only and the other paths into it would skip it.
 *
 * One error per container and node, however many of its edges lead there,
 * and at most {@link SHOWN_ARM_ERRORS} of them, so a refusal never answers
 * with more than the request sent.
 */
export function validateArmsIntoJoins(ir: Pick<ArtifactIR, 'nodes' | 'edges'>): ValidationError[] {
  const byId = new Map(ir.nodes.map((node) => [node.id, node]))
  const inDegree = new Map<string, number>()
  for (const edge of ir.edges) {
    if (edge.source === edge.target) continue
    inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1)
  }
  const errors: ValidationError[] = []
  const reported = new Set<string>()
  let unlisted = 0
  for (const edge of ir.edges) {
    const container = byId.get(edge.source)
    const target = byId.get(edge.target)
    if (!container || !target || edge.source === edge.target) continue
    if (!isArmEdgeOf(container.type, edge.label)) continue
    if ((inDegree.get(edge.target) ?? 0) < 2) continue
    const pair = JSON.stringify([container.id, target.id])
    if (reported.has(pair)) continue
    reported.add(pair)
    if (errors.length >= SHOWN_ARM_ERRORS) {
      unlisted++
      continue
    }
    errors.push({
      path: `edges.${edge.id}`,
      message: `${container.name}’s ${armName(edge.label)} leads straight into ${target.name}, which another path also reaches. Add a step to that arm first.`,
      nodeId: container.id,
    })
  }
  if (unlisted > 0) {
    errors.push({
      path: 'edges',
      message: `${unlisted} more arms lead straight into a step another path also reaches.`,
    })
  }
  return errors
}

function armName(label: string | undefined): string {
  if (!label) return 'arm'
  const shown = label.length > SHOWN_LABEL_LENGTH ? `${label.slice(0, SHOWN_LABEL_LENGTH)}…` : label
  return `“${shown}” arm`
}
