import type { ArtifactIR, NodeId } from '@awaitstep/ir'
import { insertNode, type NewNode, type StepPlacement } from './graph-edit.js'
import { removeNode } from './graph-remove.js'

/**
 * One graph edit Code holds until Save, in the same terms the immediate edit
 * took: a node placed, a node removed, or a node's fields changed from
 * `base` to `edited`. A list of these replayed on the loaded version is the
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
    case 'fields': {
      if (!ir.nodes.some((node) => node.id === op.nodeId)) {
        return { ok: false, reason: 'That node is not in this version any more.' }
      }
      return {
        ok: true,
        ir: {
          ...ir,
          nodes: ir.nodes.map((node) =>
            node.id === op.nodeId
              ? { ...node, data: withFieldEdits(node.data, op.edited, op.base) }
              : node,
          ),
        },
      }
    }
  }
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
