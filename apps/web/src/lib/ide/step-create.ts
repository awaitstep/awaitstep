import { customAlphabet } from 'nanoid'
import {
  isArmContainerType,
  isArmEdgeOf,
  stepSourcePath,
  type ArtifactIR,
  type WorkflowNode,
} from '@awaitstep/ir'
import {
  applyGraphOp,
  applyGraphOps,
  insertNode,
  type GraphOp,
  type OutgoingEdge,
  type StepPlacement,
} from '@awaitstep/codegen'
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

/** A node's field values as shown now, changed. */
export type FieldUpdate = (current: Record<string, unknown>) => Record<string, unknown>

export type SaveNodeFieldsOutcome =
  | { status: 'recorded' }
  | { status: 'refused'; reason: string }
  | { status: 'failed'; reason: string }

export interface StepCreator {
  /**
   * Records an edit to one node's fields as a pending graph edit. `update`
   * gets the node's values as Code shows them now (the saved version with
   * the pending edits) and returns them changed; only the fields that differ
   * are written on save, onto the node as that version holds it. Edits to
   * one node in a row are one entry, gone once the values are back.
   */
  saveNodeFields(nodeId: string, update: FieldUpdate): SaveNodeFieldsOutcome
  /**
   * The same for everything the canvas's panel changes on a node: its
   * fields, its name and the connections out of it (an arm's target).
   */
  saveNodeEdit(
    nodeId: string,
    update: (current: NodeSettings) => NodeSettings,
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

  /**
   * One edit to a node's settings — fields, name, connections out of it —
   * as a pending graph edit. Edits to one node in a row are one entry: it
   * grows, keeping for each part it already changes the value that was
   * saved, and goes once the node is back as it was saved.
   */
  function recordNodeEdit(
    nodeId: string,
    update: (current: NodeSettings) => NodeSettings,
  ): SaveNodeFieldsOutcome {
    const state = editable()
    if (!state.ok) return state.outcome
    const node = state.doc.nodes.find((n) => n.id === nodeId)
    if (!node) return { status: 'refused', reason: 'That node is not in this version any more.' }
    const current = settingsOf(state.doc, node)
    const edited = update(current)
    if (sameSettings(edited, current)) return { status: 'recorded' }

    const ops = getStore().graphOps
    const last = ops.at(-1)
    const merging =
      last !== undefined &&
      last.op.kind === 'fields' &&
      last.op.nodeId === nodeId &&
      last.postedOn === undefined &&
      last.saving === undefined
    let base = current
    if (merging && last.op.kind === 'fields') {
      const data: Record<string, unknown> = { ...current.data }
      for (const key of changedKeys(last.op.edited, last.op.base)) {
        if (last.op.base[key] === undefined) delete data[key]
        else data[key] = last.op.base[key]
      }
      base = {
        data,
        name:
          last.op.name && last.op.name.edited !== last.op.name.base
            ? last.op.name.base
            : current.name,
        edges: last.op.edges
          ? edgesBefore(current.edges, last.op.edges.base, last.op.edges.edited)
          : current.edges,
      }
    }
    const op = nodeEditOp(nodeId, base, edited)
    const check = applyGraphOp(state.doc, op)
    if (!check.ok) return { status: 'refused', reason: check.reason }
    const rest = merging ? ops.slice(0, -1) : ops
    if (sameSettings(edited, base)) {
      getStore().replaceGraphOps(rest)
      return { status: 'recorded' }
    }
    const entry = {
      ...(merging ? last! : { id: newPendingOpId() }),
      op,
      label: nodeEditLabel(base.name, base, edited),
    }
    getStore().replaceGraphOps([...rest, entry])
    return { status: 'recorded' }
  }

  return {
    saveNodeFields(nodeId, update) {
      return recordNodeEdit(nodeId, (current) => ({ ...current, data: update(current.data) }))
    },

    saveNodeEdit(nodeId, update) {
      return recordNodeEdit(nodeId, update)
    },

    create(placement, name, providedId, template) {
      const state = editable()
      if (!state.ok) return state.outcome
      const nodeId = providedId ?? newId()
      const isStep = (template?.type ?? 'step') === 'step'
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
      const recorded = isStep
        ? { ...node, data: { ...node.data, code: inserted.node.data.code } }
        : node
      getStore().addGraphOp({
        id: newPendingOpId(),
        op: { kind: 'insert', placement, node: recorded },
        label: insertLabel(inserted.node.name, armOf(state.doc, placement)),
      })
      const path = isStep ? stepSourcePath(nodeId) : null
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

/** The fields whose values differ (order and absent-vs-undefined aside). */
function changedKeys(a: Record<string, unknown>, b: Record<string, unknown>): string[] {
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(
    (key) => JSON.stringify(a[key]) !== JSON.stringify(b[key]),
  )
}

function sameFields(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  return changedKeys(a, b).length === 0
}

/** What a node edit can change: its fields, its name and the connections out of it. */
export interface NodeSettings {
  name: string
  data: Record<string, unknown>
  edges: OutgoingEdge[]
}

function settingsOf(doc: ArtifactIR, node: WorkflowNode): NodeSettings {
  return {
    name: node.name,
    data: node.data,
    edges: doc.edges
      .filter((edge) => edge.source === node.id)
      .map((edge) => ({
        id: edge.id,
        target: edge.target,
        ...(edge.label !== undefined && { label: edge.label }),
      })),
  }
}

function sameEdges(a: readonly OutgoingEdge[], b: readonly OutgoingEdge[]): boolean {
  const key = (edges: readonly OutgoingEdge[]) =>
    JSON.stringify(
      [...edges]
        .sort((x, y) => x.id.localeCompare(y.id))
        .map((e) => [e.id, e.target, e.label ?? null]),
    )
  return key(a) === key(b)
}

/**
 * The connections as they were before an entry's edit: each one it added,
 * removed or moved as it was saved; every other one as it is now, so a
 * connection someone else drew meanwhile is not taken for this edit's own.
 */
function edgesBefore(
  current: readonly OutgoingEdge[],
  base: readonly OutgoingEdge[],
  edited: readonly OutgoingEdge[],
): OutgoingEdge[] {
  const was = new Map(base.map((edge) => [edge.id, edge]))
  const now = new Map(edited.map((edge) => [edge.id, edge]))
  const claimed = new Set(
    [...new Set([...was.keys(), ...now.keys()])].filter((id) => {
      const a = was.get(id)
      const b = now.get(id)
      return !a || !b || a.target !== b.target || a.label !== b.label
    }),
  )
  const result = current.filter((edge) => !claimed.has(edge.id))
  for (const id of claimed) {
    const saved = was.get(id)
    if (saved) result.push(saved)
  }
  return result
}

function sameSettings(a: NodeSettings, b: NodeSettings): boolean {
  return a.name === b.name && sameFields(a.data, b.data) && sameEdges(a.edges, b.edges)
}

/** The op for `base` → `edited`, carrying a name or connections only when they change. */
function nodeEditOp(nodeId: string, base: NodeSettings, edited: NodeSettings): GraphOp {
  return {
    kind: 'fields',
    nodeId,
    edited: edited.data,
    base: base.data,
    ...(edited.name !== base.name && { name: { base: base.name, edited: edited.name } }),
    ...(!sameEdges(edited.edges, base.edges) && {
      edges: { base: base.edges, edited: edited.edges },
    }),
  }
}

/** "Changed retries on “charge”", "Renamed “a” to “b”", "Changed the connections of “w”". */
function nodeEditLabel(name: string, base: NodeSettings, edited: NodeSettings): string {
  const parts: string[] = []
  if (!sameFields(edited.data, base.data)) parts.push(fieldsLabel(name, edited.data, base.data))
  if (!sameEdges(edited.edges, base.edges)) parts.push(`Changed the connections of “${name}”`)
  const renamed = edited.name !== base.name ? `Renamed “${base.name}” to “${edited.name}”` : null
  if (renamed && parts.length === 0) return renamed
  if (renamed) return `${renamed}; ${parts.map((p) => p[0]!.toLowerCase() + p.slice(1)).join('; ')}`
  return parts.join('; ')
}
