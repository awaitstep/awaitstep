import {
  isArmEdgeOf,
  type ArtifactIR,
  type Edge,
  type NodeId,
  type WorkflowNode,
} from '@awaitstep/ir'
import { computeVarNames } from './context.js'
import { CONTAINER_TYPES } from './dag.js'
import { followStepFunctionNames } from './step-module.js'

/** A container arm left with nothing in it once the node is gone. */
export interface EmptiedArm {
  containerId: NodeId
  containerName: string
  /** The arm's edge label; "an arm" for an unlabelled parallel or race arm. */
  label: string
}

/** A surviving node whose variable name changes because a `_2` suffix moved. */
export interface RenamedNode {
  nodeId: NodeId
  name: string
  from: string
  to: string
}

/** The part of a document a removal reads and writes. */
export type GraphShape = Pick<ArtifactIR, 'nodes' | 'edges' | 'entryNodeId'>

export type RemoveNodeResult<T extends GraphShape = ArtifactIR> =
  | {
      ok: true
      ir: T
      removed: WorkflowNode
      emptiedArms: EmptiedArm[]
      renamed: RenamedNode[]
      /** The node the removed one's connections now lead to, if any. */
      next: NodeId | null
    }
  | { ok: false; reason: string }

/** The selectors a wait keeps besides its edges: the node each arm starts at. */
const WAIT_SELECTORS = ['onEventNode', 'onTimeoutNode'] as const

const ARMS_REASON = 'Remove it on the canvas — its arms need placing.'

function opensArms(type: string): boolean {
  return CONTAINER_TYPES.has(type) || type === 'wait_for_event'
}

/**
 * Why Code can't remove this node, or null when it can. A container, a wait
 * or any node that leads more than one way has arms whose chains would need
 * a new home, and that is a layout choice the canvas makes visibly. The last
 * node can't go either: a workflow always starts somewhere.
 *
 * An arm's first node whose next node is also reached another way is not
 * refused here: the reconnected arm would lead straight into a join, which
 * the save's validation refuses with its reason (`validateArmsIntoJoins`).
 */
export function removalBlocker(ir: GraphShape, nodeId: NodeId): string | null {
  const index = indexGraph(ir)
  const node = index.byId.get(nodeId)
  if (!node) return 'That node is not in this version any more.'
  return blockerFor(ir, index, node)
}

interface GraphIndex {
  byId: Map<NodeId, WorkflowNode>
  /** Edges out of each node, a self loop left out. */
  outgoing: Map<NodeId, Edge[]>
}

function indexGraph(ir: GraphShape): GraphIndex {
  const byId = new Map(ir.nodes.map((n) => [n.id, n]))
  const outgoing = new Map<NodeId, Edge[]>()
  for (const edge of ir.edges) {
    if (edge.source === edge.target) continue
    const out = outgoing.get(edge.source)
    if (out) out.push(edge)
    else outgoing.set(edge.source, [edge])
  }
  return { byId, outgoing }
}

function blockerFor(ir: GraphShape, index: GraphIndex, node: WorkflowNode): string | null {
  if (opensArms(node.type)) return ARMS_REASON
  const outgoing = index.outgoing.get(node.id) ?? []
  if (outgoing.length > 1 || outgoing.some((edge) => edge.label !== undefined)) return ARMS_REASON
  if (ir.nodes.length === 1) return 'A workflow needs at least one node. Add another first.'
  if (ir.entryNodeId === node.id && outgoing.length === 0) {
    return 'The workflow would have no start. Add a step after it first.'
  }
  return null
}

/**
 * The graph without one node, reconnected so the workflow still runs end to
 * end: every connection into the node now leads to the node after it,
 * keeping its id and label (a container's arm stays that arm). A node with
 * nothing after it takes its incoming connections with it, which can leave
 * an arm empty. The entry moves to the next node.
 *
 * The canvas drops the edges instead, since there you can draw them back;
 * Code has no edge editing, so it reconnects. Other nodes keep their
 * positions, and step functions follow the variable names the removal moves.
 */
export function removeNode<T extends GraphShape>(ir: T, nodeId: NodeId): RemoveNodeResult<T> {
  const blocker = removalBlocker(ir, nodeId)
  if (blocker !== null) return { ok: false, reason: blocker }

  const removed = ir.nodes.find((n) => n.id === nodeId)!
  const nodesById = new Map(ir.nodes.map((n) => [n.id, n]))
  const successor = ir.edges.find((edge) => edge.source === nodeId && edge.target !== nodeId)
  const next = successor?.target

  const edges: Edge[] = []
  const emptiedArms: EmptiedArm[] = []
  const seen = new Set<string>()
  const key = (edge: Edge) => JSON.stringify([edge.source, edge.target, edge.label ?? null])
  for (const edge of ir.edges) seen.add(key(edge))

  for (const edge of ir.edges) {
    if (edge.source === nodeId) continue
    if (edge.target !== nodeId) {
      edges.push(edge)
      continue
    }
    if (next === undefined) {
      const source = nodesById.get(edge.source)
      if (source && isArmEdgeOf(source.type, edge.label)) {
        emptiedArms.push({
          containerId: source.id,
          containerName: source.name,
          label: edge.label ?? 'an arm',
        })
      }
      continue
    }
    // `S → X → S` would become a loop on S; a connection that already exists
    // would become a duplicate.
    if (edge.source === next) continue
    const retargeted: Edge = { ...edge, target: next }
    const retargetedKey = key(retargeted)
    if (seen.has(retargetedKey)) continue
    seen.add(retargetedKey)
    edges.push(retargeted)
  }

  const kept = ir.nodes
    .filter((n) => n.id !== nodeId)
    .map((n) => (n.type === 'wait_for_event' ? withWaitSelectorsMoved(n, nodeId, next) : n))
  const nodes = followStepFunctionNames(ir.nodes, kept)

  const before = computeVarNames(ir.nodes)
  const after = computeVarNames(kept)
  const renamed: RenamedNode[] = []
  for (const n of kept) {
    const from = before.get(n.id)
    const to = after.get(n.id)
    if (from !== undefined && to !== undefined && from !== to) {
      renamed.push({ nodeId: n.id, name: n.name, from, to })
    }
  }

  const entryNodeId = ir.entryNodeId === nodeId ? next! : ir.entryNodeId

  return {
    ok: true,
    ir: { ...ir, nodes: [...nodes], edges, entryNodeId },
    removed,
    emptiedArms,
    renamed,
    next: next ?? null,
  }
}

/** A wait whose arm started at the removed node now starts where the edge went. */
function withWaitSelectorsMoved(
  node: WorkflowNode,
  removedId: NodeId,
  next: NodeId | undefined,
): WorkflowNode {
  if (!WAIT_SELECTORS.some((field) => node.data[field] === removedId)) return node
  const data = { ...node.data }
  for (const field of WAIT_SELECTORS) {
    if (data[field] === removedId) data[field] = next ?? ''
  }
  return { ...node, data }
}
