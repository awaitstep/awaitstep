import type { ArtifactIR, Edge, NodeId } from '@awaitstep/ir'
import { insertNode, type NewNode, type StepPlacement } from './graph-edit.js'
import { removeNode } from './graph-remove.js'
import { followStepFunctionNames } from './step-module.js'

/** One connection out of a node, as a node edit records it. */
export interface OutgoingEdge {
  id: string
  target: NodeId
  label?: string
}

/**
 * One graph edit Code holds until Save, in the same terms the immediate edit
 * took: a node placed, a node removed, or a node's settings changed — its
 * fields from `base` to `edited`, and with them its name and the connections
 * out of it (an arm's target, a branch's), as the canvas's panel changes
 * them. A list of these replayed on the loaded version is the
 * document Code shows, so a version saved underneath (the canvas, another
 * tab) only means replaying them on the new one.
 */
export type GraphOp =
  | { kind: 'insert'; placement: StepPlacement; node: NewNode }
  | { kind: 'remove'; nodeId: NodeId }
  | {
      kind: 'fields'
      nodeId: NodeId
      edited: Record<string, unknown>
      base: Record<string, unknown>
      /** The name, when this edit renames the node. */
      name?: { base: string; edited: string }
      /** The connections out of the node, when this edit changes them. */
      edges?: { base: OutgoingEdge[]; edited: OutgoingEdge[] }
    }

export type ApplyGraphOpResult = { ok: true; ir: ArtifactIR } | { ok: false; reason: string }

/** An operation that no longer applies to the document it was replayed on, and why. */
export interface DroppedGraphOp {
  /** Its position in the list given to `applyGraphOps`. */
  index: number
  reason: string
}

export interface ApplyGraphOpsResult {
  ir: ArtifactIR
  dropped: DroppedGraphOp[]
}

/**
 * `current` with the fields `edited` changed from `base` applied: set, or
 * removed when unset. A field changed meanwhile by someone else is kept
 * unless this edit changed it too.
 */
export function withFieldEdits(
  current: Record<string, unknown>,
  edited: Record<string, unknown>,
  base: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...current }
  for (const key of new Set([...Object.keys(base), ...Object.keys(edited)])) {
    if (JSON.stringify(edited[key]) === JSON.stringify(base[key])) continue
    if (edited[key] === undefined) delete next[key]
    else next[key] = edited[key]
  }
  return next
}

/** The document with one operation applied, or why it does not apply. */
export function applyGraphOp(ir: ArtifactIR, op: GraphOp): ApplyGraphOpResult {
  switch (op.kind) {
    case 'insert': {
      const result = insertNode(ir, op.placement, op.node)
      return result.ok ? { ok: true, ir: result.ir } : result
    }
    case 'remove': {
      const result = removeNode(ir, op.nodeId)
      return result.ok ? { ok: true, ir: result.ir } : result
    }
    case 'fields':
      return applyNodeEdit(ir, op)
  }
}

/**
 * A node edit on `ir`: its fields (a field changed meanwhile by someone else
 * kept unless this edit changed it too), its name (step functions follow the
 * variable names it moves, as a canvas rename does), and the connections out
 * of it — removed, retargeted or added by id. A connection to a node that
 * is gone, or to the node itself, refuses the edit.
 */
function applyNodeEdit(
  ir: ArtifactIR,
  op: Extract<GraphOp, { kind: 'fields' }>,
): ApplyGraphOpResult {
  if (!ir.nodes.some((node) => node.id === op.nodeId)) {
    return { ok: false, reason: 'That node is not in this version any more.' }
  }
  let nodes = ir.nodes.map((node) =>
    node.id === op.nodeId
      ? {
          ...node,
          data: withFieldEdits(node.data, op.edited, op.base),
          ...(op.name && op.name.edited !== op.name.base && { name: op.name.edited }),
        }
      : node,
  )
  if (op.name && op.name.edited !== op.name.base) {
    nodes = [...followStepFunctionNames(ir.nodes, nodes)]
  }
  let edges: Edge[] = ir.edges
  if (op.edges) {
    const ids = new Set(nodes.map((node) => node.id))
    const before = new Map(op.edges.base.map((edge) => [edge.id, edge]))
    const after = new Map(op.edges.edited.map((edge) => [edge.id, edge]))
    const changed = (edge: OutgoingEdge) => {
      const was = before.get(edge.id)
      return !was || was.target !== edge.target || was.label !== edge.label
    }
    // Only what this edit connects is judged: an arm it left alone is as the
    // version has it, whatever became of its target.
    const mine = [...after.values()].filter(changed)
    for (const edge of mine) {
      if (!ids.has(edge.target)) {
        return { ok: false, reason: 'It connects to a node that is not in this version any more.' }
      }
      if (edge.target === op.nodeId) return { ok: false, reason: 'A node can’t connect to itself.' }
    }
    const removed = new Set([...before.keys()].filter((id) => !after.has(id)))
    const own = (edge: OutgoingEdge): Edge => ({
      id: edge.id,
      source: op.nodeId,
      target: edge.target,
      ...(edge.label !== undefined && { label: edge.label }),
    })
    edges = ir.edges
      .filter((edge) => !(edge.source === op.nodeId && removed.has(edge.id)))
      .map((edge) => {
        const next = edge.source === op.nodeId ? after.get(edge.id) : undefined
        return next && changed(next) ? own(next) : edge
      })
    // A connection this edit added or moved goes in; one it left alone, and
    // that someone else has removed since, stays removed.
    const present = new Set(edges.map((edge) => edge.id))
    for (const edge of mine) if (!present.has(edge.id)) edges.push(own(edge))
    // A label names one connection out of a node (an arm, the way on): one
    // drawn meanwhile under the label this edit sets would make two.
    const seen = new Set<string>()
    for (const edge of edges) {
      if (edge.source !== op.nodeId || edge.label === undefined) continue
      if (seen.has(edge.label)) {
        return {
          ok: false,
          reason: `Its “${edge.label}” connection was changed in this version meanwhile.`,
        }
      }
      seen.add(edge.label)
    }
  }
  return { ok: true, ir: { ...ir, nodes, edges } }
}

/**
 * The operations replayed in order on `ir`. One that no longer applies (its
 * node is gone, its connection moved) is skipped and reported, and the rest
 * go on from the document as it stands, so one stale edit never loses the
 * others. Variable names follow each removal (`removeNode` moves step
 * functions with them), so a later operation sees the names it would have.
 */
export function applyGraphOps(ir: ArtifactIR, ops: readonly GraphOp[]): ApplyGraphOpsResult {
  let doc = ir
  const dropped: DroppedGraphOp[] = []
  ops.forEach((op, index) => {
    const result = applyGraphOp(doc, op)
    if (result.ok) doc = result.ir
    else dropped.push({ index, reason: result.reason })
  })
  return { ir: doc, dropped }
}
