import { failureLine } from '../action-toast'
import {
  ProjectFileConflictError,
  type ProjectFileSummary,
  type SourceFile,
  type WritePrecondition,
} from '../api-client'
import type { IdeSessionState } from '../../stores/ide-store'
import { basename } from './file-tree'
import { newFileOpId, opAtPath, vacatedPaths, type PendingFileOp } from './file-ops'
import { outsideState } from './outside-changes'
import { compareTabId } from './tabs'

export interface PendingFileClient {
  putProjectFile(
    workflowId: string,
    path: string,
    source: string,
    precondition: WritePrecondition,
  ): Promise<ProjectFileSummary>
  deleteProjectFile(workflowId: string, path: string, ifMatch: string): Promise<void>
}

interface Notify {
  error(message: string, options?: { description?: string }): void
}

export interface PendingFileDeps {
  workflowId: string
  client: PendingFileClient
  notify: Notify
  /** The files as Code shows them, pending changes applied, drafts not. */
  getBaseline: () => ReadonlyMap<string, SourceFile>
  getStore: () => IdeSessionState
  /** Still the workspace these were built for; a finished write must not touch another one's session. */
  isCurrent: () => boolean
  isStep: (path: string) => boolean
}

/** What one pending change's save came to, and the file it wrote (a new or renamed one). */
export interface FileOpSaved {
  status: 'saved' | 'conflict' | 'failed'
  written?: { path: string; hash: string }
}

export interface PendingFileActions {
  /** Records a new file; false (having said why) when the path can't take one. */
  create(path: string, source: string): boolean
  rename(from: string, to: string): boolean
  remove(path: string): boolean
  /** Drops one pending change and puts the screen back as it was. */
  discard(id: string): void
  /** Writes one pending change; the caller records the version once for the batch. */
  save(op: PendingFileOp): Promise<FileOpSaved>
  /** After the batch's refetch: the written changes stop being pending. */
  settle(saved: readonly { op: PendingFileOp; written?: FileOpSaved['written'] }[]): void
}

const SAVE_FIRST =
  'Its old file is deleted or renamed, but not saved yet. Save first, or discard that change.'

/**
 * Code's Explorer changes, held until Save: New File, Rename and Delete
 * change only the screen and the session's pending list (`fileOps`). Save
 * writes each one with the same preconditions the immediate actions used: a
 * new path only if it is still free, a delete only of the version that was
 * read.
 */
export function createPendingFileActions(deps: PendingFileDeps): PendingFileActions {
  const { workflowId, client, notify, getBaseline, getStore, isCurrent, isStep } = deps

  // Changes written but not yet settled (their batch's refetch is still
  // landing): until then nothing in the Explorer may change, or an edit made
  // meanwhile would be dropped with the change it builds on.
  let unsettled = 0

  /** Refuses (saying why) while a save of file changes is in flight. */
  function saving(): boolean {
    if (unsettled === 0) return false
    notify.error('Wait for the save to finish', {
      description: 'Your file changes are being written.',
    })
    return true
  }

  function ops(): readonly PendingFileOp[] {
    return getStore().fileOps
  }

  function replace(next: readonly PendingFileOp[]): void {
    getStore().replaceFileOps(next)
  }

  function without(id: string): PendingFileOp[] {
    return ops().filter((op) => op.id !== id)
  }

  /** Why `path` can't take a file now, or null. */
  function pathRefusal(path: string): string | null {
    if (vacatedPaths(ops()).has(path)) return SAVE_FIRST
    if (getBaseline().has(path)) return 'A file with that name already exists.'
    return null
  }

  /** A file's tab, Compare tab, draft and review focus go (its text is gone or stashed). */
  function closeFile(path: string): void {
    getStore().clearDraft(path)
    getStore().closeFiles([path, compareTabId(path)])
    if (getStore().reviewPath === path) getStore().setReviewPath(null)
  }

  function liveStore(): IdeSessionState | null {
    return isCurrent() ? getStore() : null
  }

  return {
    create(path, source) {
      if (saving()) return false
      const refusal = pathRefusal(path)
      if (refusal) {
        notify.error(`Couldn’t create ${basename(path)}`, { description: refusal })
        return false
      }
      replace([...ops(), { kind: 'create', id: newFileOpId(), path, source }])
      return true
    },

    rename(from, to) {
      if (isStep(from) || saving()) return false
      const pending = opAtPath(ops(), from)
      // Back to its own old name is the one freed path a file may take.
      const refusal = pending?.kind === 'move' && to === pending.from ? null : pathRefusal(to)
      if (refusal) {
        notify.error(`Couldn’t rename ${basename(from)}`, { description: refusal })
        return false
      }
      if (pending?.kind === 'create') {
        replace(ops().map((op) => (op.id === pending.id ? { ...pending, path: to } : op)))
      } else if (pending?.kind === 'move') {
        // Renamed back to where it was: nothing is left to save.
        replace(
          to === pending.from
            ? without(pending.id)
            : ops().map((op) => (op.id === pending.id ? { ...pending, to } : op)),
        )
      } else {
        const base = getBaseline().get(from)
        const draft = getStore().drafts[from]
        // The copy at the new path is the person's text, built on the version
        // they read: a file that moved on since (or was deleted on the server)
        // is settled in Compare or its banner first.
        if (
          !base ||
          outsideState(getBaseline(), from, draft) !== null ||
          getStore().conflicts[from]
        ) {
          notify.error(`Couldn’t rename ${basename(from)}`, {
            description: 'It changed on the server since you edited it. Compare it first.',
          })
          getStore().openFile(from)
          return false
        }
        const hash = draft ? draft.baseHash : (base.hash ?? null)
        replace([
          ...ops(),
          { kind: 'move', id: newFileOpId(), from, to, source: base.source, hash },
        ])
      }
      getStore().moveFile(from, to)
      return true
    },

    remove(path) {
      if (isStep(path) || saving()) return false
      const pending = opAtPath(ops(), path)
      const draft = getStore().drafts[path]
      if (pending?.kind === 'create') {
        replace(without(pending.id))
      } else if (pending?.kind === 'move' && pending.hash === null) {
        // A renamed virtual seed: nothing stored to delete, only the local copy goes.
        replace(without(pending.id))
      } else if (pending?.kind === 'move') {
        // A renamed file deleted: the stored file at its old path is what goes.
        replace([
          ...without(pending.id),
          {
            kind: 'delete',
            id: newFileOpId(),
            path: pending.from,
            hash: pending.hash,
            ...(draft && { stashedDraft: draft }),
          },
        ])
      } else {
        const base = getBaseline().get(path)
        // A file deleted on the server (its banner shows): only the local copy is left to drop.
        if (!base) {
          closeFile(path)
          return true
        }
        // A draft built on no stored version next to a stored file: the file
        // appeared after the edit began, and deleting it would remove text
        // the person never read. Settled in Compare first, as before.
        if (draft && draft.baseHash === null && base?.hash) {
          notify.error(`Couldn’t delete ${basename(path)}`, {
            description: 'It changed on the server since you edited it. Compare it first.',
          })
          getStore().openFile(path)
          return false
        }
        const hash = draft ? draft.baseHash : (base?.hash ?? null)
        // Nothing stored (a virtual seed): only the local copy goes.
        if (hash !== null) {
          replace([
            ...ops(),
            {
              kind: 'delete',
              id: newFileOpId(),
              path,
              hash,
              ...(draft && { stashedDraft: draft }),
            },
          ])
        }
      }
      closeFile(path)
      return true
    },

    discard(id) {
      if (saving()) return
      const op = ops().find((entry) => entry.id === id)
      if (!op) return
      replace(without(id))
      if (op.kind === 'create') closeFile(op.path)
      else if (op.kind === 'move') getStore().moveFile(op.to, op.from)
      else if (op.stashedDraft && !getStore().drafts[op.path]) {
        getStore().replaceDrafts({ ...getStore().drafts, [op.path]: op.stashedDraft })
      }
    },

    async save(op) {
      unsettled += 1
      const result = await write(op)
      // A change that wasn't written has nothing to settle.
      if (result.status !== 'saved') unsettled -= 1
      return result
    },

    settle(saved) {
      unsettled = Math.max(0, unsettled - saved.length)
      const live = liveStore()
      if (!live || saved.length === 0) return
      // In one go, once the refetch has the files: the drafts build on what was
      // written, and the changes stop being pending, so nothing flickers. Only
      // an entry still exactly as it was written goes.
      for (const { written } of saved) {
        if (written && live.drafts[written.path]) live.rebaseDraft(written.path, written.hash)
      }
      const done = new Set(saved.map(({ op }) => op))
      getStore().replaceFileOps(getStore().fileOps.filter((entry) => !done.has(entry)))
    },
  }

  async function write(op: PendingFileOp): Promise<FileOpSaved> {
    if (op.kind === 'delete') return saveDelete(op)
    // The text comes from this workspace's session only, never another one's.
    if (!isCurrent()) return { status: 'failed' }
    const path = op.kind === 'create' ? op.path : op.to
    const source = getStore().drafts[path]?.source ?? op.source
    let written: ProjectFileSummary
    try {
      written = await client.putProjectFile(workflowId, path, source, { ifNoneMatch: true })
    } catch (err) {
      const taken = err instanceof ProjectFileConflictError
      notify.error(`Couldn’t ${op.kind === 'create' ? 'create' : 'rename to'} ${basename(path)}`, {
        description: taken
          ? 'A file with that name was created meanwhile. Rename yours, then save.'
          : failureLine(err, 'Try again.'),
      })
      return { status: taken ? 'conflict' : 'failed' }
    }
    if (op.kind === 'move' && op.hash) {
      try {
        // A newer version that lands now is kept and reported.
        await client.deleteProjectFile(workflowId, op.from, op.hash)
      } catch (err) {
        // Already gone (a teammate deleted it): the rename is complete.
        if (!isNotFound(err)) {
          const reason = failureLine(err, '')
          notify.error(
            `Created ${basename(op.to)} but couldn’t remove ${basename(op.from)}`,
            reason ? { description: reason } : undefined,
          )
        }
      }
    }
    return { status: 'saved', written: { path, hash: written.hash } }
  }

  async function saveDelete(op: Extract<PendingFileOp, { kind: 'delete' }>): Promise<FileOpSaved> {
    if (op.hash !== null) {
      try {
        await client.deleteProjectFile(workflowId, op.path, op.hash)
      } catch (err) {
        // Already gone: what the delete was for has happened.
        if (isNotFound(err)) return { status: 'saved' }
        notify.error(failureLine(err, `Couldn’t delete ${basename(op.path)}`))
        return { status: err instanceof ProjectFileConflictError ? 'conflict' : 'failed' }
      }
    }
    return { status: 'saved' }
  }
}

function isNotFound(err: unknown): boolean {
  return (err as { status?: unknown } | null)?.status === 404
}
