import { applyGraphOps, removeNode } from '@awaitstep/codegen'
import { stepSourcePath, type NodeId } from '@awaitstep/ir'
import type { IdeSessionState } from '../../stores/ide-store'
import {
  discardableOps,
  newPendingOpId,
  opsOf,
  removeLabel,
  waitingOps,
  type PendingGraphOp,
} from './graph-ops'
import { replayBase } from './graph-ops-actions'
import type { LoadedVersion } from './node-source'
import { compareTabId } from './tabs'

export type RemoveNodeOutcome =
  | { status: 'removed'; nodeId: string }
  | { status: 'refused'; reason: string }
  | { status: 'failed'; reason: string }

export interface NodeRemoverDeps {
  getStore: () => IdeSessionState
  /** The saved version and the document on screen, or the outcome that refuses the edit. */
  editable: () =>
    | { ok: true; version: LoadedVersion; doc: LoadedVersion['doc'] }
    | { ok: false; outcome: { status: 'refused' | 'failed'; reason: string } }
}

/**
 * How Code removes a node: `removeNode` checks it against the document on
 * screen, and it is recorded as a pending edit. A node only a pending Add
 * put there is un-added instead (its Add and field edits go), unless a later
 * pending edit builds on it. The step's file closes at once and its unsaved
 * code goes with it (the dialog warned); it is kept on the pending edit, so
 * discarding the removal brings it back. The selection moves to the node
 * after it (a container's way on, not an arm), else the one before.
 */
export function createNodeRemover(deps: NodeRemoverDeps) {
  return function removeOnce(nodeId: NodeId): RemoveNodeOutcome {
    const state = deps.editable()
    if (!state.ok) return state.outcome

    const result = removeNode(state.doc, nodeId)
    if (!result.ok) return { status: 'refused', reason: result.reason }

    const { getStore } = deps
    const path = stepSourcePath(nodeId)
    const draft = getStore().drafts[path]
    const unadded = withoutPendingAdd(getStore().graphOps, state.version, nodeId)
    if (unadded) {
      getStore().replaceGraphOps(unadded)
    } else {
      const entry: PendingGraphOp = {
        id: newPendingOpId(),
        op: { kind: 'remove', nodeId },
        label: removeLabel(result.removed.name),
        ...(draft && { stashedDraft: { path, draft } }),
      }
      getStore().addGraphOp(entry)
    }

    getStore().clearDraft(path)
    getStore().clearConflict(path)
    // Its Compare tab and the review's focus go with it, as for a deleted file.
    getStore().closeFiles([path, compareTabId(path)])
    if (getStore().reviewPath === path) getStore().setReviewPath(null)
    if (getStore().selectedNodeId === nodeId) {
      getStore().selectNode(result.next ?? predecessorOf(state.doc, nodeId))
    }
    return { status: 'removed', nodeId }
  }
}

/**
 * The pending edits without the Add that put `nodeId` there and its field
 * edits, when nothing later builds on that Add and no post in flight
 * carries them; else null, and the removal is recorded as an edit of its own.
 */
function withoutPendingAdd(
  pending: readonly PendingGraphOp[],
  version: LoadedVersion,
  nodeId: NodeId,
): PendingGraphOp[] | null {
  const waiting = waitingOps(pending)
  const added = discardableOps(pending).some(
    ({ op }) => op.kind === 'insert' && op.node.id === nodeId,
  )
  if (!added) return null
  const ofNode = (entry: PendingGraphOp) =>
    entry.postedOn === undefined &&
    entry.saving === undefined &&
    ((entry.op.kind === 'insert' && entry.op.node.id === nodeId) ||
      (entry.op.kind === 'fields' && entry.op.nodeId === nodeId))
  const rest = waiting.filter((entry) => !ofNode(entry))
  const { dropped } = applyGraphOps(replayBase(version, pending), opsOf(rest))
  if (dropped.length > 0) return null
  return pending.filter((entry) => !ofNode(entry))
}

/** The node before `nodeId`, else none. */
function predecessorOf(doc: LoadedVersion['doc'], nodeId: NodeId): NodeId | null {
  const before = doc.edges.find((edge) => edge.target === nodeId && edge.source !== nodeId)
  return before?.source ?? null
}
