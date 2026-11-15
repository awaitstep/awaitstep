import { customAlphabet } from 'nanoid'
import { isArmContainerType, isArmEdgeOf, stepSourcePath, type ArtifactIR } from '@awaitstep/ir'
import { applyGraphOp, applyGraphOps, insertNode, type StepPlacement } from '@awaitstep/codegen'
import type { IdeSessionState } from '../../stores/ide-store'
import { replayBase } from './graph-ops-actions'
import { fieldsLabel, insertLabel, newPendingOpId, opsOf, waitingOps } from './graph-ops'
import type { LoadedVersion } from './node-source'
import { createNodeRemover, type RemoveNodeOutcome } from './step-remove'

export interface StepCreateDeps {
  getStore: () => IdeSessionState
  /** Still the workspace this action was built for; see `ProjectActionDeps.isCurrent`. */
  isCurrent?: () => boolean
  /**
   * The saved version a save would build on (`StepSaver.currentVersion`):
   * the pending edits are validated against it with themselves replayed.
   */
  getVersion: () => LoadedVersion | null
  /** The workspace accepts edits right now (the current version, a role that may edit). */
  canEdit: () => boolean
  /** Why it does not, worded for the person. */
  readOnlyReason: () => string
  /** The fallback id when the caller does not pass one; injected in tests. */
  newId?: () => string
}

export type CreateStepOutcome =
  /** `path`: the new step's file; null for a custom node, which has none of its own. */
  | { status: 'created'; nodeId: string; path: string | null }
  | { status: 'refused'; reason: string }
  | { status: 'failed'; reason: string }

/** A custom or marketplace node to add instead of a step: its type and field values. */
export interface NewTemplateNode {
  type: string
  data: Record<string, unknown>
}

export type SaveNodeFieldsOutcome =
  | { status: 'recorded' }
  | { status: 'refused'; reason: string }
  | { status: 'failed'; reason: string }

export interface StepCreator {
  /**
   * Records one node's field edits as a pending graph edit. Only the fields
   * that differ between `base` (the data the edits started from) and
   * `edited` are written on save, onto the node as that version holds it.
   */
  saveNodeFields(
    nodeId: string,
    edited: Record<string, unknown>,
    base: Record<string, unknown>,
  ): SaveNodeFieldsOutcome
  /**
   * Adds a step — or, given `template`, a custom node — as a pending graph
   * edit: it shows at once and is written with the next save. A new step's
   * `steps/<id>.ts` opens as a new file; a custom node (which has no source
   * file) is selected so its details show. A refusal (an unknown node, a
   * branch without a chosen arm) records nothing.
   */
  create(
    placement: StepPlacement,
    name: string,
    /** A caller-chosen id, used to make the file name match the typed name. */
    nodeId?: string,
    template?: NewTemplateNode,
  ): CreateStepOutcome
  /**
   * Removes a node as a pending graph edit, reconnecting the nodes on either
   * side (`removeNode`) on save. A refusal (a container, the last node)
   * records nothing.
   */
  remove(nodeId: string): RemoveNodeOutcome
}

const newNodeId = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789_', 12)

/**
 * How Code edits the graph: each edit is checked against the document on
 * screen (the saved version with the pending edits replayed) and recorded
 * as one more pending edit. Nothing is posted; the next save writes every
 * pending edit and step draft as one version (`createStepSaver`).
 */
export function createStepCreator(deps: StepCreateDeps): StepCreator {
  const { getStore, getVersion } = deps
  const isCurrent = deps.isCurrent ?? (() => true)
  const newId = deps.newId ?? newNodeId

  /** The saved version and the document on screen, or why there is none to edit. */
  function editable():
    | { ok: true; version: LoadedVersion; doc: LoadedVersion['doc'] }
    | { ok: false; outcome: { status: 'refused' | 'failed'; reason: string } } {
    if (!isCurrent()) {
      return {
        ok: false,
        outcome: { status: 'failed', reason: 'This workspace is no longer open.' },
      }
    }
    if (!deps.canEdit()) {
      return { ok: false, outcome: { status: 'refused', reason: deps.readOnlyReason() } }
    }
    const version = getVersion()
    if (!version) {
      return {
        ok: false,
        outcome: {
          status: 'failed',
          reason: 'Open this workflow on the canvas and save it once, then try again.',
        },
      }
    }
    const pending = getStore().graphOps
    const doc = applyGraphOps(replayBase(version, pending), opsOf(waitingOps(pending))).ir
    return { ok: true, version, doc }
  }

  const removeOnce = createNodeRemover({ getStore, editable })

  return {
    saveNodeFields(nodeId, edited, base) {
      const state = editable()
      if (!state.ok) return state.outcome
      const node = state.doc.nodes.find((n) => n.id === nodeId)
      if (!node) return { status: 'refused', reason: 'That node is not in this version any more.' }
      const op = { kind: 'fields' as const, nodeId, edited, base }
      if (!applyGraphOp(state.doc, op).ok) {
        return { status: 'refused', reason: 'That node is not in this version any more.' }
      }
      getStore().addGraphOp({
        id: newPendingOpId(),
        op,
        label: fieldsLabel(node.name, edited, base),
      })
      return { status: 'recorded' }
    },

    create(placement, name, providedId, template) {
      const state = editable()
      if (!state.ok) return state.outcome
      const nodeId = providedId ?? newId()
      const node = {
        id: nodeId,
        name,
        type: template?.type ?? 'step',
        ...(template && { data: template.data }),
      }
      const inserted = insertNode(state.doc, placement, node)
      if (!inserted.ok) return { status: 'refused', reason: inserted.reason }

      // A step keeps the scaffold it opened with: replayed where the names
      // differ (a discard before it, a canvas save under it), a fresh one
      // would change the text a draft of it was started from.
      const recorded = template ? node : { ...node, data: { code: inserted.node.data.code } }
      getStore().addGraphOp({
        id: newPendingOpId(),
        op: { kind: 'insert', placement, node: recorded },
        label: insertLabel(inserted.node.name, armOf(state.doc, placement)),
      })
      const path = template ? null : stepSourcePath(nodeId)
      if (path) getStore().openFile(path)
      else getStore().selectNode(nodeId)
      return { status: 'created', nodeId, path }
    },

    remove(nodeId) {
      return removeOnce(nodeId)
    },
  }
}

/** The block and arm a placement puts the new node in, or null for a plain place. */
function armOf(
  doc: ArtifactIR,
  placement: StepPlacement,
): { container: string; arm: string | null } | null {
  if ('first' in placement) return null
  const container = doc.nodes.find((node) => node.id === placement.after)
  if (!container || !isArmContainerType(container.type)) return null
  if ('arm' in placement) return { container: container.name, arm: placement.arm }
  const edge = doc.edges.find((e) => e.id === placement.edgeId)
  if (!edge) return null
  if (edge.label === 'then') return { container: container.name, arm: 'then' }
  if (!isArmEdgeOf(container.type, edge.label)) return null
  return { container: container.name, arm: edge.label || 'an arm' }
}
