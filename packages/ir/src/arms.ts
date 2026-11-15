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
  const index = armIndex(ir.nodes, ir.edges)
  const errors: ValidationError[] = []
  const reported = new Set<string>()
  let unlisted = 0
  // A wait's arm set by its field alone runs its node as an arm connection would.
  const fieldArms = index.fieldArms.map((arm) => ({
    id: `${arm.source}.${arm.field}`,
    source: arm.source,
    target: arm.target,
    label: arm.label,
    path: `nodes.${arm.source}.data.${arm.field}`,
  }))
  const edgeArms = ir.edges.map((edge) => ({ ...edge, path: `edges.${edge.id}` }))
  for (const edge of [...edgeArms, ...fieldArms]) {
    const container = index.byId.get(edge.source)
    const target = index.byId.get(edge.target)
    if (!container || !target || edge.source === edge.target) continue
    if (!isArmEdgeOf(container.type, edge.label)) continue
    if ((index.entries.get(edge.target) ?? 0) < 2) continue
    if (index.mergesAt(container.id, edge.target)) continue
    const pair = JSON.stringify([container.id, target.id])
    if (reported.has(pair)) continue
    reported.add(pair)
    if (errors.length >= SHOWN_ARM_ERRORS) {
      unlisted++
      continue
    }
    errors.push({
      path: edge.path,
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

/**
 * For every branch and wait whose arms meet at a node one of them leads
 * straight into, that node, by container id. Generated code runs it inside
 * each arm; the Steps list shows it as that arm. One pass over the graph.
 */
export function armMergeTargets(
  nodes: readonly ArmNode[],
  edges: readonly ArmEdge[],
): Map<string, string> {
  const index = armIndex(nodes, edges)
  const merges = new Map<string, string>()
  for (const [containerId, arms] of index.arms) {
    for (const target of arms) {
      if ((index.entries.get(target) ?? 0) < 2) continue
      if (index.mergesAt(containerId, target)) {
        merges.set(containerId, target)
        break
      }
    }
  }
  return merges
}

/** The node fields the arm rules read: a wait's arm fields win over its edges, as codegen reads them. */
export interface ArmNode {
  id: string
  type: string
  name?: string
  data?: Record<string, unknown>
}

export interface ArmEdge {
  source: string
  target: string
  label?: string
}

/** Containers whose generated code runs the node their arms meet at inside each arm. */
const MERGES_INTO_ARMS: ReadonlySet<string> = new Set(['branch', 'wait_for_event'])

interface ArmIndex {
  byId: Map<string, ArmNode & { name: string }>
  inDegree: Map<string, number>
  /** Each branch's and wait's arm targets (a wait's fields first). */
  arms: Map<string, Set<string>>
  /** Ways into each node as generated code runs them: connections, plus field-only wait arms. */
  entries: Map<string, number>
  /** A wait's arms set only by its field, with no connection under that label to the node. */
  fieldArms: { source: string; target: string; label: string; field: string }[]
  mergesAt(containerId: string, join: string): boolean
}

/**
 * The graph read once for the arm rules: in-degrees, connections out of each
 * node, each container's arms, and — lazily, each computed once — where each
 * arm's chain ends, followed the way codegen's `collectChain` follows it:
 * through a node with one connection into a node only it reaches, and
 * through a block only by its `then`.
 */
function armIndex(nodes: readonly ArmNode[], edges: readonly ArmEdge[]): ArmIndex {
  const byId = new Map(nodes.map((node) => [node.id, { ...node, name: node.name ?? node.id }]))
  const inDegree = new Map<string, number>()
  const outgoing = new Map<string, ArmEdge[]>()
  for (const edge of edges) {
    if (edge.source === edge.target) continue
    inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1)
    const out = outgoing.get(edge.source)
    if (out) out.push(edge)
    else outgoing.set(edge.source, [edge])
  }
  const arms = new Map<string, Set<string>>()
  const fieldArms: ArmIndex['fieldArms'] = []
  // Ways into a node as the generated code runs them: its connections, and a
  // wait's arm that runs it by its field alone.
  const entries = new Map(inDegree)
  for (const node of byId.values()) {
    if (!MERGES_INTO_ARMS.has(node.type)) continue
    const out = outgoing.get(node.id) ?? []
    const targets = new Set<string>()
    if (node.type === 'wait_for_event') {
      // Codegen follows a set field even to a node that is gone (that arm
      // then runs nothing), so a field always wins here too.
      for (const [label, field] of Object.entries(WAIT_ARM_FIELDS)) {
        const selected = node.data?.[field]
        const viaField = typeof selected === 'string' && selected !== '' ? selected : undefined
        const target = viaField ?? out.find((edge) => edge.label === label)?.target
        if (target) targets.add(target)
        const fieldOnly =
          viaField !== undefined &&
          byId.has(viaField) &&
          viaField !== node.id &&
          !out.some((edge) => edge.label === label && edge.target === viaField)
        if (fieldOnly) {
          fieldArms.push({ source: node.id, target: viaField, label, field })
          entries.set(viaField, (entries.get(viaField) ?? 0) + 1)
        }
      }
    } else {
      // A branch's arms are its conditions, each the first connection under
      // its label, as codegen reads them: a connection under any other label
      // runs nowhere.
      const branches = Array.isArray(node.data?.branches) ? node.data.branches : []
      for (const branch of branches) {
        const label = (branch as { label?: unknown } | null)?.label
        if (typeof label !== 'string') continue
        const target = out.find((edge) => edge.label === label)?.target
        if (target) targets.add(target)
      }
    }
    arms.set(node.id, targets)
  }

  const ends = new Map<string, string>()
  const chainEnd = (start: string): string => {
    const known = ends.get(start)
    if (known !== undefined) return known
    const path: string[] = []
    const onPath = new Set<string>()
    let current = start
    for (;;) {
      const cached = ends.get(current)
      if (cached !== undefined) {
        current = cached
        break
      }
      path.push(current)
      onPath.add(current)
      const node = byId.get(current)
      const out = outgoing.get(current) ?? []
      let next: string | undefined
      if (node && isArmContainerType(node.type)) {
        next = out.find((edge) => edge.label === CONTINUE_LABEL)?.target
      } else if (out.length === 1) {
        next = out[0]!.target
      }
      if (next === undefined || onPath.has(next) || (inDegree.get(next) ?? 0) !== 1) break
      current = next
    }
    for (const id of path) ends.set(id, current)
    return current
  }

  const judged = new Map<string, boolean>()
  return {
    byId,
    inDegree,
    arms,
    fieldArms,
    entries,
    mergesAt(containerId, join) {
      const key = JSON.stringify([containerId, join])
      const cached = judged.get(key)
      if (cached !== undefined) return cached
      const targets = arms.get(containerId)
      let result = targets !== undefined && targets.size >= 2 && targets.has(join)
      if (result) {
        for (const start of targets!) {
          if (start === join) continue
          const end = chainEnd(start)
          if (end === join || !(outgoing.get(end) ?? []).some((edge) => edge.target === join)) {
            result = false
            break
          }
        }
      }
      // Only the arms lead there: one way in per arm (a field-only arm is one).
      if (result) result = (entries.get(join) ?? 0) === targets!.size
      judged.set(key, result)
      return result
    },
  }
}

function armName(label: string | undefined): string {
  if (!label) return 'arm'
  const shown = label.length > SHOWN_LABEL_LENGTH ? `${label.slice(0, SHOWN_LABEL_LENGTH)}…` : label
  return `“${shown}” arm`
}
