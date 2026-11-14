import { customAlphabet } from 'nanoid'
import { stepSourcePath } from '@awaitstep/ir'
import { insertNode, type StepPlacement } from '@awaitstep/codegen'
import type { LoadedVersion } from './node-source'
import { createVersionPoster, type GraphSaveDeps } from './graph-save'
import { createNodeRemover, type RemoveNodeOutcome } from './step-remove'

export interface StepCreateDeps extends GraphSaveDeps {
  /** The version the workspace shows, read at create time; null when there is none. */
  getVersion: () => LoadedVersion | null
  /**
   * The version in the query cache only — not a remembered response — so the
   * create can tell whether the refetch after it actually landed.
   */
  getCachedVersion: () => LoadedVersion | null
  /** Saves already asked for finish first, and later ones wait, so two writes never share a base. */
  exclusive: <T>(work: () => Promise<T>) => Promise<T>
  /** The workspace accepts edits right now (the current version, a role that may edit). */
  canEdit: () => boolean
  /** Why it does not, worded for the person. */
  readOnlyReason: () => string
  /** The fallback id when the caller does not pass one; injected in tests. */
  newId?: () => string
}

export type CreateStepOutcome =
  /** `path`: the new step's file; null for a custom node, which has none of its own. */
  | { status: 'created'; nodeId: string; path: string | null; opened: boolean }
  | { status: 'refused'; reason: string }
  | { status: 'graph-conflict' }
  | { status: 'failed'; reason: string }

/** A custom or marketplace node to add instead of a step: its type and field values. */
export interface NewTemplateNode {
  type: string
  data: Record<string, unknown>
}

export type SaveNodeFieldsOutcome =
  | { status: 'saved' }
  | { status: 'refused'; reason: string }
  | { status: 'graph-conflict' }
  | { status: 'failed'; reason: string }

export interface StepCreator {
  /**
   * Saves one node's field edits as the next version, through the same queue
   * and conflict refusal as `create`. Only the fields that differ between
   * `base` (the data the edits started from) and `edited` are written, onto
   * the node as the version to save holds it: a field changed meanwhile by
   * someone else is kept unless this edit changed it too.
   */
  saveNodeFields(
    nodeId: string,
    edited: Record<string, unknown>,
    base: Record<string, unknown>,
  ): Promise<SaveNodeFieldsOutcome>
  /**
   * Adds a step — or, given `template`, a custom node — to the loaded version
   * and saves it as the next version, never a file write. On success a new
   * step's `steps/<id>.ts` is opened, and a custom node (which has no source
   * file) is selected so its details show; a refusal (an unknown node, a
   * branch without a chosen arm) writes nothing.
   */
  create(
    placement: StepPlacement,
    name: string,
    /** A caller-chosen id, used to make the file name match the typed name. */
    nodeId?: string,
    template?: NewTemplateNode,
  ): Promise<CreateStepOutcome>
  /**
   * Removes a node from the loaded version, reconnecting the nodes on either
   * side (`removeNode`), and saves it as the next version through the same
   * queue and conflict refusal. A refusal (a container, the last node)
   * writes nothing.
   */
  remove(nodeId: string): Promise<RemoveNodeOutcome>
}

const newNodeId = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789_', 12)

/**
 * How Code adds a step: `insertStep` builds the document — the node, its
 * edges and its module code — and it is posted as one version on the base
 * the workspace loaded, so a canvas save that landed meanwhile is the
 * existing graph-conflict refusal, not a silent overwrite. The create and
 * the step saver share one queue, so neither can post on a base the other
 * has already moved past.
 */
export function createStepCreator(deps: StepCreateDeps): StepCreator {
  const { getStore, getVersion, getCachedVersion } = deps
  const isCurrent = deps.isCurrent ?? (() => true)
  const newId = deps.newId ?? newNodeId
  const postVersion = createVersionPoster(deps)
  const removeOnce = createNodeRemover({
    getStore,
    isCurrent,
    getVersion,
    getCachedVersion,
    notify: deps.notify,
    canEdit: deps.canEdit,
    readOnlyReason: deps.readOnlyReason,
    post: postVersion,
  })

  return {
    async saveNodeFields(nodeId, edited, base) {
      return deps.exclusive(async (): Promise<SaveNodeFieldsOutcome> => {
        try {
          return await saveFieldsOnce(nodeId, edited, base)
        } catch {
          return { status: 'failed', reason: 'Couldn’t save the node.' }
        }
      })
    },
    async create(placement, name, providedId, template) {
      return deps.exclusive(async (): Promise<CreateStepOutcome> => {
        try {
          return await createOnce(placement, name, providedId, template)
        } catch {
          // A bug's own message is no reason a person can act on.
          return { status: 'failed', reason: `Couldn’t create the ${template ? 'node' : 'step'}.` }
        }
      })
    },
    async remove(nodeId) {
      return deps.exclusive(async (): Promise<RemoveNodeOutcome> => {
        try {
          return await removeOnce(nodeId)
        } catch {
          return { status: 'failed', reason: 'Couldn’t remove the node.' }
        }
      })
    },
  }

  async function createOnce(
    placement: StepPlacement,
    name: string,
    providedId?: string,
    template?: NewTemplateNode,
  ): Promise<CreateStepOutcome> {
    const noun = template ? 'node' : 'step'
    // Queued work starts later than its call: by then the person may have
    // left for another workflow, whose session the shared store now holds.
    if (!isCurrent()) return { status: 'failed', reason: 'This workspace is no longer open.' }
    if (!deps.canEdit()) return { status: 'refused', reason: deps.readOnlyReason() }

    const version = getVersion()
    if (!version) {
      return {
        status: 'failed',
        reason: 'Open this workflow on the canvas and save it once, then try again.',
      }
    }

    const nodeId = providedId ?? newId()
    const inserted = insertNode(version.doc, placement, {
      id: nodeId,
      name,
      type: template?.type ?? 'step',
      ...(template && { data: template.data }),
    })
    if (!inserted.ok) return { status: 'refused', reason: inserted.reason }

    const posted = await postVersion(version, inserted.ir, {
      failure: `Couldn’t create the ${noun}`,
      refused: 'Nothing was created',
    })
    if (posted.status !== 'saved') return posted
    const saved = posted.version
    const path = template ? null : stepSourcePath(nodeId)
    // The file is a view of the saved version: open it only once the
    // workspace has read that version back. A refetch that did not land
    // (React Query resolves even when its request fails) would open a tab
    // with nothing behind it, so say so instead. A custom node has no file:
    // selecting it shows its details, which need the version read back too.
    const landed = getCachedVersion()?.graphHash === saved.graphHash
    if (isCurrent()) {
      if (!landed) {
        deps.notify.error(`Created the ${noun}, but the workspace didn’t reload`, {
          description: path ? 'Reload the page to open its file.' : 'Reload the page to see it.',
        })
      } else if (path) getStore().openFile(path)
      else getStore().selectNode(nodeId)
    }
    return { status: 'created', nodeId, path, opened: landed }
  }

  async function saveFieldsOnce(
    nodeId: string,
    edited: Record<string, unknown>,
    base: Record<string, unknown>,
  ): Promise<SaveNodeFieldsOutcome> {
    if (!isCurrent()) return { status: 'failed', reason: 'This workspace is no longer open.' }
    if (!deps.canEdit()) return { status: 'refused', reason: deps.readOnlyReason() }
    const version = getVersion()
    if (!version) return { status: 'failed', reason: 'This workflow has no saved version yet.' }
    if (!version.doc.nodes.some((node) => node.id === nodeId)) {
      return { status: 'refused', reason: 'That node is not in this version any more.' }
    }
    const ir = {
      ...version.doc,
      nodes: version.doc.nodes.map((node) =>
        node.id === nodeId ? { ...node, data: withEdits(node.data, edited, base) } : node,
      ),
    }
    const posted = await postVersion(version, ir, {
      failure: 'Couldn’t save the node',
      refused: 'Nothing was saved',
    })
    if (posted.status !== 'saved') return posted
    // The panel shows the saved values once the workspace reads the version
    // back; one that didn't would look as if the save were undone.
    const landed = getCachedVersion()?.graphHash === posted.version.graphHash
    if (!landed && isCurrent()) {
      deps.notify.error('Saved the node, but the workspace didn’t reload', {
        description: 'Reload the page to see it.',
      })
    }
    return { status: 'saved' }
  }
}

/** `current` with the fields `edited` changed from `base` applied: set, or removed when unset. */
export function withEdits(
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
