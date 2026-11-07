import type { StepPlacement } from '@awaitstep/codegen'
import { stepSourcePath } from '@awaitstep/ir'
import type { WorkflowNode } from '@awaitstep/ir'
import { sanitizeIdentifier } from '@awaitstep/codegen'
import { placementChoices, type PlacementChoice } from './step-placements'
import type { StepRow } from './step-order'

export type FlowSide = 'after' | 'before'

/** The edge fields the fast-path list needs; `StepSyncEdge` fits it. */
export interface FlowEdge {
  id: string
  source: string
  target: string
  label?: string
}

export function placementKey(placement: StepPlacement): string {
  return 'first' in placement
    ? 'first'
    : JSON.stringify([placement.after, placement.edgeId ?? null])
}

export function choiceKey(choice: PlacementChoice): string {
  return placementKey(choice.placement)
}

/** The `.ts` stem shown in the map header. */
export function stepFileStem(name: string): string {
  return (sanitizeIdentifier(name.trim()) || 'new_step').toLowerCase()
}

/**
 * The node id a created step will use, so `steps/<id>.ts` matches the name
 * the person typed (and stays a valid, unique, lowercase path segment).
 */
export function uniqueStepId(
  name: string,
  nodes: ReadonlyMap<string, unknown>,
  taken: ReadonlySet<string> = new Set(),
): string {
  const base = stepFileStem(name).slice(0, 55) || 'step'
  // Keep the id verbatim under stepSourcePath: a name such as "worker" would
  // otherwise be rewritten to steps/worker-<hash>.ts behind the dialog.
  const verbatim = (id: string) => stepSourcePath(id) === `steps/${id}.ts`
  const isTaken = (id: string) => nodes.has(id) || taken.has(id.toLowerCase())
  const stem = verbatim(base) ? base : `${base}_step`
  if (!isTaken(stem)) return stem
  for (let suffix = 2; suffix < 100_000; suffix++) {
    const candidate = `${stem}_${suffix}`
    if (!isTaken(candidate)) return candidate
  }
  return `${stem}_${Date.now().toString(36)}`
}

/** A node with no connection or one plain connection can take an "after". */
export function afterChoices(choices: readonly PlacementChoice[]): PlacementChoice[] {
  return choices.filter(
    (choice) => !('first' in choice.placement) && choice.placement.edgeId === undefined,
  )
}

/**
 * "Before <node>" choices: the entry, or a node with exactly one incoming
 * edge (a splice before it). A join has no single before, so it stays on the
 * map.
 */
export function beforeChoices(
  rows: readonly StepRow[],
  nodes: ReadonlyMap<string, WorkflowNode>,
  edges: readonly FlowEdge[],
  entryNodeId: string | null,
): PlacementChoice[] {
  const incoming = new Map<string, FlowEdge[]>()
  const idCounts = new Map<string, number>()
  for (const edge of edges) {
    const from = incoming.get(edge.target)
    if (from) from.push(edge)
    else incoming.set(edge.target, [edge])
    idCounts.set(edge.id, (idCounts.get(edge.id) ?? 0) + 1)
  }
  const list: PlacementChoice[] = []
  for (const row of rows) {
    const node = nodes.get(row.nodeId)
    if (!node) continue
    const from = incoming.get(row.nodeId) ?? []
    if (from.length === 0 && row.nodeId === entryNodeId) {
      list.push({
        placement: { first: true },
        label: `Before ${node.name}`,
        nodeId: row.nodeId,
        nodeName: node.name,
        nodeType: node.type,
      })
    } else if (from.length === 1 && from[0]!.source !== row.nodeId) {
      const edge = from[0]!
      if (!nodes.has(edge.source) || idCounts.get(edge.id) !== 1) continue
      list.push({
        placement: { after: edge.source, edgeId: edge.id },
        label: `Before ${node.name}`,
        nodeId: row.nodeId,
        nodeName: node.name,
        nodeType: node.type,
      })
    }
  }
  return list
}

/** All placements, in the Steps order (empty while the dialog is closed). */
export function flowChoices(
  open: boolean,
  rows: readonly StepRow[],
  nodes: ReadonlyMap<string, WorkflowNode>,
  edges: readonly FlowEdge[],
  entryNodeId: string | null,
): PlacementChoice[] {
  if (!open) return []
  const list = placementChoices(rows, nodes, edges)
  if (list.some((choice) => 'first' in choice.placement)) return list
  // A non-empty graph still has a spot before its entry.
  const entry = entryNodeId === null ? undefined : nodes.get(entryNodeId)
  return [
    {
      placement: { first: true },
      label: 'Before the first step',
      nodeId: entry?.id ?? null,
      nodeName: entry?.name ?? null,
      nodeType: entry?.type ?? null,
    },
    ...list,
  ]
}
