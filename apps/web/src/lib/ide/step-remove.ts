import { removeNode } from '@awaitstep/codegen'
import { stepSourcePath, type NodeId } from '@awaitstep/ir'
import type { LoadedVersion } from './node-source'
import type { PostedVersion, PostWords } from './graph-save'
import type { IdeSessionState } from '../../stores/ide-store'
import { compareTabId } from './tabs'

export type RemoveNodeOutcome =
  | { status: 'removed'; nodeId: string }
  | { status: 'refused'; reason: string }
  | { status: 'graph-conflict' }
  | { status: 'failed'; reason: string }

export interface NodeRemoverDeps {
  getStore: () => IdeSessionState
  isCurrent: () => boolean
  getVersion: () => LoadedVersion | null
  getCachedVersion: () => LoadedVersion | null
  notify: { error(message: string, options?: { description?: string }): void }
  canEdit: () => boolean
  readOnlyReason: () => string
  post: (
    version: LoadedVersion,
    ir: LoadedVersion['doc'],
    words: PostWords,
  ) => Promise<PostedVersion>
}

/**
 * How Code removes a node: `removeNode` builds the reconnected document and
 * it is posted as one version on the base the workspace loaded, so a canvas
 * save that landed meanwhile is refused as for Add. Once saved, the step's
 * own file closes and its unsaved draft goes (the dialog warned about it),
 * and the selection moves to the node after it (a container's way on, not
 * an arm), else the one before.
 * Run inside the step saver's queue by the caller.
 */
export function createNodeRemover(deps: NodeRemoverDeps) {
  return async function removeOnce(nodeId: NodeId): Promise<RemoveNodeOutcome> {
    if (!deps.isCurrent()) return { status: 'failed', reason: 'This workspace is no longer open.' }
    if (!deps.canEdit()) return { status: 'refused', reason: deps.readOnlyReason() }
    const version = deps.getVersion()
    if (!version) return { status: 'failed', reason: 'This workflow has no saved version yet.' }

    const result = removeNode(version.doc, nodeId)
    if (!result.ok) return { status: 'refused', reason: result.reason }

    const posted = await deps.post(version, result.ir, {
      failure: `Couldn’t remove ${result.removed.name}`,
      refused: 'Nothing was removed',
    })
    if (posted.status !== 'saved') return posted

    if (deps.isCurrent()) {
      const store = deps.getStore()
      const path = stepSourcePath(nodeId)
      store.clearDraft(path)
      store.clearConflict(path)
      // Its Compare tab and the review's focus go with it, as for a deleted file.
      store.closeFiles([path, compareTabId(path)])
      if (store.reviewPath === path) store.setReviewPath(null)
      if (store.selectedNodeId === nodeId) {
        store.selectNode(result.next ?? predecessorOf(version.doc, nodeId))
      }
      if (deps.getCachedVersion()?.graphHash !== posted.version.graphHash) {
        deps.notify.error(`Removed ${result.removed.name}, but the workspace didn’t reload`, {
          description: 'Reload the page to see the change.',
        })
      }
    }
    return { status: 'removed', nodeId }
  }
}

/** The node before `nodeId`, else none. */
function predecessorOf(doc: LoadedVersion['doc'], nodeId: NodeId): NodeId | null {
  const before = doc.edges.find((edge) => edge.target === nodeId && edge.source !== nodeId)
  return before?.source ?? null
}
