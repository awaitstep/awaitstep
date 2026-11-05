import { UNDO_TOAST_MS, type ActionToastOptions } from '../action-toast'
import { restoreSnapshot, type Drafts } from './drafts'
import { basename } from './file-tree'
import { compareTabId } from './tabs'

interface DraftUndoStore {
  drafts: Drafts
  replaceDrafts: (drafts: Drafts) => void
  openFile?: (path: string) => void
  closeFile?: (path: string) => void
}

export interface DraftUndoDeps {
  getStore: () => DraftUndoStore
  notify: { info: (text: string, options?: ActionToastOptions) => void }
}

export interface DraftUndo {
  /** Drops every draft, with an Undo toast. */
  discardAll: () => void
  /** Drops one file's draft, with an Undo toast. */
  revertFile: (path: string) => void
  /**
   * Replaces your unsaved copy with the server's (Load saved version, Use the
   * server version). Undo brings the copy back as it was, still built on the
   * hash it started from, so it shows as changed on the server again and the
   * next save goes through the same check.
   */
  takeServerVersion: (path: string, message: string) => void
  /** Lets go of an unsaved copy whose file was deleted on the server, closing its tab. */
  discardDeleted: (path: string) => void
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
 * seconds. Undo goes through `restoreSnapshot`: a copy comes back as it was,
 * on its old base hash, so a file that moved on or was deleted meanwhile
 * shows as changed or deleted on the server rather than losing the copy.
 */
export function createDraftUndo({ getStore, notify }: DraftUndoDeps): DraftUndo {
  let disposed = false

  function undo(snapshot: Drafts) {
    if (disposed) {
      notify.info('Can’t undo after leaving this workflow.')
      return
    }
    const store = getStore()
    const result = restoreSnapshot(snapshot, store.drafts)
    if (result.restored.length > 0) store.replaceDrafts(result.drafts)
    const total = Object.keys(snapshot).length
    if (result.skipped.length === 0) {
      notify.info(`Brought back ${plural(result.restored.length)}.`)
      return
    }
    const names = result.skipped.map(basename).join(', ')
    notify.info(
      result.restored.length === 0
        ? 'Couldn’t bring the changes back.'
        : `Brought back ${result.restored.length} of ${total} files.`,
      { description: `You’ve edited ${names} again since, so those edits were kept.` },
    )
  }

  // Brings back one dropped copy exactly as it was, with the toast for one file.
  function restoreCopy(path: string, draft: Drafts[string], reopen: boolean) {
    if (disposed) {
      notify.info('Can’t undo after leaving this workflow.')
      return
    }
    const store = getStore()
    if (path in store.drafts) {
      notify.info(`Couldn’t bring back ${basename(path)}.`, {
        description: 'You’ve edited it again since.',
      })
      return
    }
    store.replaceDrafts({ ...store.drafts, [path]: draft })
    if (reopen) store.openFile?.(path)
    notify.info(`Brought back ${basename(path)}.`)
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
    takeServerVersion(path, message) {
      const store = getStore()
      const draft = store.drafts[path]
      if (!draft) return
      const { [path]: _removed, ...rest } = store.drafts
      store.replaceDrafts(rest)
      notify.info(message, {
        duration: UNDO_TOAST_MS,
        action: { label: 'Undo', onClick: () => restoreCopy(path, draft, false) },
      })
    },
    discardDeleted(path) {
      const store = getStore()
      const draft = store.drafts[path]
      if (!draft) return
      const { [path]: _removed, ...rest } = store.drafts
      store.replaceDrafts(rest)
      store.closeFile?.(path)
      // A Compare tab of this file has nothing left to compare.
      store.closeFile?.(compareTabId(path))
      notify.info(`Discarded your copy of ${basename(path)}.`, {
        duration: UNDO_TOAST_MS,
        action: { label: 'Undo', onClick: () => restoreCopy(path, draft, true) },
      })
    },
  }
}
