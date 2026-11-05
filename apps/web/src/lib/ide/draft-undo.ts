import { UNDO_TOAST_MS, type ActionToastOptions } from '../action-toast'
import { restoreSnapshot, type Drafts } from './drafts'
import { basename } from './file-tree'

interface DraftUndoStore {
  drafts: Drafts
  replaceDrafts: (drafts: Drafts) => void
}

export interface DraftUndoDeps {
  getStore: () => DraftUndoStore
  getBaseline: () => ReadonlyMap<string, { hash?: string | undefined }>
  notify: { info: (text: string, options?: ActionToastOptions) => void }
}

export interface DraftUndo {
  /** Drops every draft, with an Undo toast. */
  discardAll: () => void
  /** Drops one file's draft, with an Undo toast. */
  revertFile: (path: string) => void
  /**
   * Called when the workspace goes away. An Undo toast outlives it, but its
   * snapshot belongs to that workflow: applying it elsewhere would show one
   * workflow's edits as unsaved changes in another.
   */
  dispose: () => void
}

function plural(count: number): string {
  return count === 1 ? '1 file' : `${count} files`
}

/**
 * Discard and Revert drop drafts at once, so each keeps a snapshot for ten
 * seconds. Undo goes through `restoreSnapshot`, which refuses to revive an
 * edit against a file that has changed since.
 */
export function createDraftUndo({ getStore, getBaseline, notify }: DraftUndoDeps): DraftUndo {
  let disposed = false

  function undo(snapshot: Drafts) {
    if (disposed) {
      notify.info('Can’t undo after leaving this workflow.')
      return
    }
    const store = getStore()
    const result = restoreSnapshot(snapshot, store.drafts, getBaseline())
    if (result.restored.length > 0) store.replaceDrafts(result.drafts)
    const total = Object.keys(snapshot).length
    if (result.skipped.length === 0) {
      notify.info(`Brought back ${plural(result.restored.length)}.`)
      return
    }
    const names = result.skipped.map(basename).join(', ')
    const verb = result.skipped.length === 1 ? 'was' : 'were'
    const skippedObject = result.skipped.length === 1 ? 'it' : 'them'
    notify.info(
      result.restored.length === 0
        ? 'Couldn’t bring the changes back.'
        : `Brought back ${result.restored.length} of ${total} files.`,
      {
        description: `${names} ${verb} changed on the server in the meantime, so your edits to ${skippedObject} weren’t brought back.`,
      },
    )
  }

  function announce(text: string, snapshot: Drafts) {
    notify.info(text, {
      duration: UNDO_TOAST_MS,
      action: { label: 'Undo', onClick: () => undo(snapshot) },
    })
  }

  return {
    dispose() {
      disposed = true
    },
    discardAll() {
      const store = getStore()
      const snapshot = store.drafts
      const count = Object.keys(snapshot).length
      if (count === 0) return
      store.replaceDrafts({})
      announce(`Discarded changes to ${plural(count)}.`, snapshot)
    },
    revertFile(path) {
      const store = getStore()
      const draft = store.drafts[path]
      if (!draft) return
      const { [path]: _removed, ...rest } = store.drafts
      store.replaceDrafts(rest)
      announce(`Reverted ${basename(path)}.`, { [path]: draft })
    },
  }
}
