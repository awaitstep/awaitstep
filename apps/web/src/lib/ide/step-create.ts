import { customAlphabet } from 'nanoid'
import { stepSourcePath } from '@awaitstep/ir'
import { insertNode, type StepPlacement } from '@awaitstep/codegen'
import { failureLine } from '../action-toast'
import { VersionConflictError, type SavedVersion } from '../api-client'
import type { IdeSessionState } from '../../stores/ide-store'
import { loadVersionDocument, withoutFileSnapshot, type LoadedVersion } from './node-source'

export interface StepCreateClient {
  createVersion(
    workflowId: string,
    data: { ir: unknown; baseGraphHash?: string },
  ): Promise<SavedVersion>
}

export interface StepCreateDeps {
  workflowId: string
  client: StepCreateClient
  getStore: () => IdeSessionState
  /** Still the workspace this action was built for; see `ProjectActionDeps.isCurrent`. */
  isCurrent?: () => boolean
  /** The version the workspace shows, read at create time; null when there is none. */
  getVersion: () => LoadedVersion | null
  /**
   * The version in the query cache only — not a remembered response — so the
   * create can tell whether the refetch after it actually landed.
   */
  getCachedVersion: () => LoadedVersion | null
  notify: { error(message: string, options?: { description?: string }): void }
  /** Saves already asked for finish first, and later ones wait, so two writes never share a base. */
  exclusive: <T>(work: () => Promise<T>) => Promise<T>
  /** Records the version this create wrote, so the next save builds on it while the cache lags. */
  remember: (baseGraphHash: string, version: LoadedVersion) => void
  /** The server has moved past the base: drop the remembered version. */
  forget: () => void
  /** Refetches the workspace once a version has been written (or refused). */
  refresh: () => Promise<void>
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

export interface StepCreator {
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
  const { workflowId, client, getStore, getVersion, getCachedVersion, refresh } = deps
  const isCurrent = deps.isCurrent ?? (() => true)
  const newId = deps.newId ?? newNodeId

  return {
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

    let saved: SavedVersion
    try {
      saved = await client.createVersion(workflowId, {
        ir: withoutFileSnapshot(inserted.ir),
        baseGraphHash: version.graphHash,
      })
    } catch (err) {
      if (err instanceof VersionConflictError) {
        deps.forget()
        if (isCurrent()) {
          const store = getStore()
          const existing = store.graphConflict
          if (existing !== null && existing.paths.length > 0) {
            // A step save's draft notice is the more actionable one: keep it
            // and say the create failed separately.
            deps.notify.error('Nothing was created', {
              description: 'The canvas changed this workflow. Try again.',
            })
          } else {
            // Not a toast: the workspace notice explains, and the refetch
            // marks every draft whose node moved too.
            store.setGraphConflict({
              currentVersionId: err.currentVersionId,
              currentGraphHash: err.currentGraphHash,
              paths: [],
            })
          }
        }
        await refresh()
        return { status: 'graph-conflict' }
      }
      return { status: 'failed', reason: failureLine(err, `Couldn’t create the ${noun}`) }
    }

    if (isCurrent()) getStore().setGraphConflict(null)
    const next = loadVersionDocument({ version: saved, graphHash: saved.graphHash })
    if (next) deps.remember(version.graphHash, next)
    else deps.forget()
    await refresh().catch(() => undefined)
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
}
