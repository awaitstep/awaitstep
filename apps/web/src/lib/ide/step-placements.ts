import type { StepPlacement } from '@awaitstep/codegen'
import type { WorkflowNode } from '@awaitstep/ir'
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
 * way on. The rule mirrors `orderSteps`: a loop's `body`, a try/catch's
 * `try`/`catch`/`finally`, and every branch/parallel/race edge but `then`.
 */
export function isArmEdge(node: Pick<WorkflowNode, 'type'>, edge: { label?: string }): boolean {
  switch (node.type) {
    case 'loop':
      return edge.label === 'body'
    case 'try_catch':
      return edge.label === 'try' || edge.label === 'catch' || edge.label === 'finally'
    case 'branch':
    case 'parallel':
    case 'race':
      return edge.label !== 'then'
    default:
      return false
  }
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
 * its edge label or the node it leads to. A connection id that names two edges
 * is left out: splicing by it would drop one of them, so `insertStep` refuses
 * it.
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
  }
  return choices
}
