import type { StepPlacement } from '@awaitstep/codegen'
import {
  CONTINUE_LABEL,
  isArmContainerType,
  isArmEdgeOf,
  openArmSlots,
  waitArmEdgeOverridden,
  WAIT_ARM_FIELDS,
  type OpenArmSlot,
  type WorkflowNode,
} from '@awaitstep/ir'
import type { StepRow } from './step-order'

export interface PlacementEdge {
  id: string
  source: string
  target: string
  label?: string
}

/**
 * One place a new step can go, as the picker lists it. The placement is what
 * `insertStep` accepts; the label is what a person reads ("After Fetch user",
 * "Into try", "Before Send mail").
 */
export interface PlacementChoice {
  placement: StepPlacement
  label: string
  /** The node the new step goes after; null for the first-step choice. */
  nodeId: string | null
  nodeName: string | null
  nodeType: string | null
}

/**
 * Whether the edge leaves its node through one of its arms rather than as its
 * way on: a loop's `body`, a try/catch's `try`/`catch`/`finally`, a wait's
 * `onEvent`/`onTimeout`, and every branch/parallel/race edge but `then`.
 */
export function isArmEdge(node: Pick<WorkflowNode, 'type'>, edge: { label?: string }): boolean {
  return isArmEdgeOf(node.type, edge.label)
}

/**
 * True when `{ after: node.id }` is both safe and truthful: nothing follows
 * the node, or exactly one connection that is its way on (not an arm). An arm
 * is spliced *before its target* — "After the loop" would be the opposite of
 * where the step lands — and a connection id shared by two edges has no safe
 * splice at all, so both need an explicit edge choice instead.
 */
export function appendsAfter(
  node: Pick<WorkflowNode, 'type'>,
  outgoing: readonly PlacementEdge[],
  edgeCounts: ReadonlyMap<string, number>,
): boolean {
  // A branching node's slots are named: an unlabelled edge out of it is an
  // arm the generated code may not follow.
  if (isArmContainerType(node.type)) return false
  if (outgoing.length === 0) return true
  if (outgoing.length > 1) return false
  const only = outgoing[0]!
  if (edgeCounts.get(only.id) !== 1) return false
  return !isArmEdge(node, only)
}

/**
 * Every connection a step could be inserted on, in the order the Steps view
 * reads the graph. A node with nothing or one plain connection after it offers
 * one "After <name>" (the only edge is spliced, or the step is appended); a
 * node with several, or with an arm, offers one choice per connection, named by
 * its edge label or the node it leads to. A branching node also offers each
 * slot with nothing in it: an empty arm ("Into catch"), a new arm of a
 * parallel or race, and "After <name>" when nothing follows the block (see
 * `openSlotsFor`). A connection id that names two edges is left out:
 * splicing by it would drop one of them, so `insertStep` refuses it, and so
 * is a wait's arm edge its field overrides (the code would skip the step).
 */
export function placementChoices(
  rows: readonly StepRow[],
  nodes: ReadonlyMap<string, WorkflowNode>,
  edges: readonly PlacementEdge[],
): PlacementChoice[] {
  if (rows.length === 0) {
    return [
      {
        placement: { first: true },
        label: 'Before the first step',
        nodeId: null,
        nodeName: null,
        nodeType: null,
      },
    ]
  }

  const idCounts = new Map<string, number>()
  const outgoingByNode = new Map<string, PlacementEdge[]>()
  for (const edge of edges) {
    idCounts.set(edge.id, (idCounts.get(edge.id) ?? 0) + 1)
    const list = outgoingByNode.get(edge.source)
    if (list) list.push(edge)
    else outgoingByNode.set(edge.source, [edge])
  }

  const choices: PlacementChoice[] = []
  for (const row of rows) {
    const node = nodes.get(row.nodeId)
    if (!node) continue
    const outgoing = outgoingByNode.get(row.nodeId) ?? []
    if (appendsAfter(node, outgoing, idCounts)) {
      choices.push({
        placement: { after: node.id },
        label: `After ${node.name}`,
        nodeId: node.id,
        nodeName: node.name,
        nodeType: node.type,
      })
      continue
    }
    for (const edge of outgoing) {
      if (idCounts.get(edge.id) !== 1) continue
      if (waitArmEdgeOverridden(node, edge, (id) => nodes.has(id))) continue
      const target = nodes.get(edge.target)
      choices.push({
        placement: { after: node.id, edgeId: edge.id },
        label:
          edge.label && isArmEdge(node, edge)
            ? `Into ${edge.label}`
            : `Before ${target?.name ?? 'the next step'}`,
        nodeId: node.id,
        nodeName: node.name,
        nodeType: node.type,
      })
    }
    for (const slot of openSlotsFor(node, outgoing, edges, (id) => nodes.has(id))) {
      choices.push({
        placement: { after: node.id, arm: slot.label },
        label: openArmLabel(node, slot.label),
        nodeId: node.id,
        nodeName: node.name,
        nodeType: node.type,
      })
    }
  }
  return choices
}

/** Types whose arms run their shared tail inside each arm: a block after them runs after it. */
const ARMS_INLINE_THEIR_JOIN = new Set(['branch', 'wait_for_event'])

/**
 * A branching node's empty slots as Code offers them. A branch or wait whose
 * arms already meet at a node has no "after" of its own: the generated code
 * runs that node inside each arm, so a block after it would run after the
 * shared node, while the Steps list would show it before. "After <that
 * node>" is the place instead.
 */
export function openSlotsFor(
  node: WorkflowNode,
  outgoing: readonly PlacementEdge[],
  edges: readonly PlacementEdge[],
  hasNode: (id: string) => boolean,
): OpenArmSlot[] {
  const slots = openArmSlots(node, outgoing, hasNode)
  if (!ARMS_INLINE_THEIR_JOIN.has(node.type) || !armsRejoin(node, outgoing, edges)) return slots
  return slots.filter((slot) => slot.label !== CONTINUE_LABEL)
}

// One adjacency per edge list, however many blocks ask: a list is rebuilt, never mutated.
const adjacency = new WeakMap<readonly PlacementEdge[], Map<string, string[]>>()

function targetsBySource(edges: readonly PlacementEdge[]): Map<string, string[]> {
  const cached = adjacency.get(edges)
  if (cached) return cached
  const next = new Map<string, string[]>()
  for (const edge of edges) {
    const list = next.get(edge.source)
    if (list) list.push(edge.target)
    else next.set(edge.source, [edge.target])
  }
  adjacency.set(edges, next)
  return next
}

/** Whether two of the node's arms reach a common node (not crossing back through it). */
function armsRejoin(
  node: WorkflowNode,
  outgoing: readonly PlacementEdge[],
  edges: readonly PlacementEdge[],
): boolean {
  const starts = new Set<string>()
  for (const edge of outgoing) if (isArmEdgeOf(node.type, edge.label)) starts.add(edge.target)
  // A wait's fields are what its code follows.
  for (const field of Object.values(WAIT_ARM_FIELDS)) {
    const selected = node.data[field]
    if (node.type === 'wait_for_event' && typeof selected === 'string' && selected) {
      starts.add(selected)
    }
  }
  if (starts.size < 2) return false
  const next = targetsBySource(edges)
  const seenBy = new Map<string, string>()
  for (const start of starts) {
    const stack = [start]
    const mine = new Set<string>()
    while (stack.length > 0) {
      const id = stack.pop()!
      if (id === node.id || mine.has(id)) continue
      mine.add(id)
      const other = seenBy.get(id)
      if (other !== undefined && other !== start) return true
      seenBy.set(id, start)
      stack.push(...(next.get(id) ?? []))
    }
  }
  return false
}

/** "Into onTimeout" for an empty named arm, "New arm" for a fan-out, "After <block>" for its way on. */
export function openArmLabel(node: Pick<WorkflowNode, 'name'>, label: string | null): string {
  if (label === null) return `New arm of ${node.name}`
  if (label === CONTINUE_LABEL) return `After ${node.name}`
  return `Into ${label}`
}
