import { failureLine } from '../action-toast'
import { VersionConflictError, type SavedVersion } from '../api-client'
import type { IdeSessionState } from '../../stores/ide-store'
import { loadVersionDocument, withoutFileSnapshot, type LoadedVersion } from './node-source'

export interface GraphSaveClient {
  createVersion(
    workflowId: string,
    data: { ir: unknown; baseGraphHash?: string },
  ): Promise<SavedVersion>
}

/** What a graph edit from Code (add, field save, remove) needs to post its version. */
export interface GraphSaveDeps {
  workflowId: string
  client: GraphSaveClient
  getStore: () => IdeSessionState
  /** Still the workspace this action was built for; see `ProjectActionDeps.isCurrent`. */
  isCurrent?: () => boolean
  notify: { error(message: string, options?: { description?: string }): void }
  /** Records the version this edit wrote, so the next save builds on it while the cache lags. */
  remember: (baseGraphHash: string, version: LoadedVersion) => void
  /** The server has moved past the base: drop the remembered version. */
  forget: () => void
  /** Refetches the workspace once a version has been written (or refused). */
  refresh: () => Promise<void>
}

export type PostedVersion =
  | { status: 'saved'; version: SavedVersion }
  | { status: 'graph-conflict' }
  | { status: 'failed'; reason: string }

/** The toast lines: the general failure, and the title when the canvas got there first. */
export interface PostWords {
  failure: string
  refused: string
}

/**
 * Posts `ir` as the next version on the base the workspace loaded. A canvas
 * save that landed meanwhile is the graph-conflict refusal; on success the
 * written version is remembered and the workspace refetched. Callers run it
 * inside the step saver's queue, so two writes never share a base.
 */
export function createVersionPoster(deps: GraphSaveDeps) {
  const { workflowId, client, getStore, refresh } = deps
  const isCurrent = deps.isCurrent ?? (() => true)

  return async function postVersion(
    version: LoadedVersion,
    ir: LoadedVersion['doc'],
    words: PostWords,
  ): Promise<PostedVersion> {
    let saved: SavedVersion
    try {
      saved = await client.createVersion(workflowId, {
        ir: withoutFileSnapshot(ir),
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
            // and say this write failed separately.
            deps.notify.error(words.refused, {
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
      return { status: 'failed', reason: failureLine(err, words.failure) }
    }

    if (isCurrent()) getStore().setGraphConflict(null)
    const next = loadVersionDocument({ version: saved, graphHash: saved.graphHash })
    if (next) deps.remember(version.graphHash, next)
    else deps.forget()
    await refresh().catch(() => undefined)
    return { status: 'saved', version: saved }
  }
}
