import { PROJECT_HANDLERS_PATH, handlerEntry } from '@awaitstep/ir'
import { failureLine } from '../action-toast'
import { copyToClipboard } from '../utils'
import { handlerModuleScaffold, type HandlerTarget } from '@awaitstep/codegen'
import {
  ProjectFileConflictError,
  type HandlerConversionResult,
  type ProjectFileSummary,
  type SourceFile,
  type WritePrecondition,
} from '../api-client'
import type { IdeSessionState } from '../../stores/ide-store'
import { dirtyPaths, overlayDrafts } from './drafts'
import { basename } from './file-tree'
import { outsideState } from './outside-changes'
import { compareTabId } from './tabs'
import { importSpecifier, type FileOwner } from './project'
import { countImporters, toSearchFiles } from './search'
import { deletedPathOf, fileOpSaveKeys, opAtPath, type PendingFileOp } from './file-ops'
import { waitingOps } from './graph-ops'
import type { FileOpSaved, PendingFileActions } from './pending-file-actions'
import { GRAPH_EDITS_KEY, type StepSaveOutcome, type StepSaveOutcomes } from './step-save'

export interface ProjectFileClient {
  putProjectFile(
    workflowId: string,
    path: string,
    source: string,
    precondition: WritePrecondition,
  ): Promise<ProjectFileSummary>
  deleteProjectFile(workflowId: string, path: string, ifMatch: string): Promise<void>
  convertHandlers(workflowId: string, ifMatch?: string): Promise<HandlerConversionResult>
}

interface ToastAction {
  label: string
  onClick: () => void
}

export interface Notifier {
  success(message: string, options?: { description?: string; action?: ToastAction }): void
  error(message: string, options?: { description?: string; action?: ToastAction }): void
}

export interface ProjectActionDeps {
  workflowId: string
  /** What the workflow compiles to; it decides a new fetch handler's scaffold. */
  target: HandlerTarget
  client: ProjectFileClient
  notify: Notifier
  /** The loaded files, virtual seeds included — never the draft overlay. */
  getBaseline: () => ReadonlyMap<string, SourceFile>
  getStore: () => IdeSessionState
  /**
   * Still the workspace these actions were built for. A write can outlive the
   * page: once the user has moved on (another workflow, or closed the
   * editor) the global session belongs to something else, so a finished
   * write must not touch it. Defaults to always true.
   */
  isCurrent?: () => boolean
  /**
   * The workspace accepts edits right now (the current version, a role that
   * may edit). Read when an action starts: a view that turned read-only
   * under open drafts (its version became historical) still shows the
   * buttons that call these, and none of them may then send a write.
   */
  canEdit: () => boolean
  /** The project's own paths (stored files, virtual seeds, step sources); every other file is generated. */
  getProjectPaths: () => ReadonlySet<string>
  /**
   * Who a path belongs to. A step's source is saved through the version,
   * never written as a file, so every write here asks first.
   */
  ownerOf: (path: string) => FileOwner
  /** Saves step drafts as one version (`createStepSaver`); it refetches by itself. */
  saveSteps: (paths: readonly string[]) => Promise<StepSaveOutcomes>
  /**
   * Records the project files into the current version once a batch of file
   * writes has landed, so a files-only edit is versioned too. Never throws;
   * does nothing while the workflow has no version.
   */
  commit: () => Promise<void>
  /**
   * The errors the editor shows on a file now. Every write that sends a
   * draft (save, overwrite, recreate, a rename carrying a draft, the save
   * before a handler conversion) holds a file with any back, keeping its
   * draft, and says which; warnings never hold one back. Markers lag typing
   * by the language worker's debounce (about half a second), so a save made
   * within it is judged on the text as it was a moment before. Defaults to none.
   */
  errorsIn?: (path: string) => number
  /** Refetches the workspace once a write has landed. */
  refresh: () => Promise<void>
  /** Opens Search on the old import path after a rename that left importers behind. */
  onShowImporters?: (specifier: string) => void
  /**
   * Code's Explorer changes wait for Save: given, New File, Rename and Delete
   * record a pending change here instead of writing, and Save writes them.
   * The Library leaves it out and writes at once.
   */
  pending?: PendingFileActions
  /**
   * How other files import a path, or null. Defaults to the workflow's
   * `#app/<path>`; the Library names `#modules/<slug>` instead.
   */
  importSpecifierOf?: (path: string) => string | null
}

export interface ProjectFileActions {
  /** Saves one file; false when there was nothing to save or the write was refused. */
  saveFile(path: string): Promise<boolean>
  /**
   * Saves these drafts as one batch — the step drafts as one version, the
   * files one write each, then one commit — and says for each whether it
   * was written, in the order given.
   */
  saveFiles(paths: readonly string[]): Promise<boolean[]>
  /** Saves every dirty draft; resolves to how many were written. */
  saveAll(): Promise<number>
  /** The file has unsaved changes and errors, so a save holds it back (and has said so). */
  isHeldBack(path: string): boolean
  /**
   * Compare's "Keep mine and overwrite": writes the draft over the server
   * copy the person was looking at (`serverHash`, null when it was gone).
   * Anything that landed since is a fresh conflict, never a silent overwrite.
   */
  overwriteFile(path: string, serverHash: string | null): Promise<boolean>
  /** "Save to recreate": writes a draft whose file was deleted on the server, only if the path is still free. */
  recreateFile(path: string): Promise<boolean>
  createFile(path: string, source?: string): Promise<boolean>
  renameFile(from: string, to: string): Promise<boolean>
  deleteFile(path: string): Promise<boolean>
  /** Deletes every project file under a folder, each against the hash the person read. */
  deleteFolder(dir: string): Promise<boolean>
  /**
   * Splits the annotation file (or the legacy trigger-code setting) into
   * handler modules. The server does the whole conversion in one request —
   * modules written together, the file removed, the setting cleared, crons
   * and queue settings folded into the deployment config — so a failure
   * never leaves the project half converted.
   */
  convertHandlers(): Promise<HandlerConversionResult | null>
}

/** "index.ts has 1 error, so it wasn't saved", or the files a batch held back. */
export function heldBackMessage(held: readonly { path: string; errors: number }[]): string {
  if (held.length === 1) {
    const { path, errors } = held[0]!
    return `${basename(path)} has ${errors === 1 ? '1 error' : `${errors} errors`}, so it wasn’t saved`
  }
  const names = held.map((file) => basename(file.path)).join(', ')
  return `${held.length} files have errors, so they weren’t saved: ${names}`
}

type WriteOutcome = ProjectFileSummary | 'conflict' | 'failed'
type SaveOutcome = StepSaveOutcome

const NO_OUTCOMES: StepSaveOutcomes = new Map()

/** The create toast's button: puts the import path on the clipboard. */
function copyImportAction(specifier: string, notify: Notifier): ToastAction {
  return {
    label: 'Copy import',
    onClick: () => {
      copyToClipboard(specifier).catch(() => notify.error('Couldn’t copy the import'))
    },
  }
}

/** A failed write's toast: the server's reason, or `line` when it gave none (see `failureLine`). */
function failed(notify: Notifier, line: string, err: unknown) {
  notify.error(failureLine(err, line))
}

/**
 * The workspace's writes, with the bookkeeping that keeps them safe for a
 * file an agent may be editing at the same time: every write is conditional
 * on the hash the draft started from (or on the path being free), a refused
 * write is recorded as a conflict the editor shows until Compare settles it
 * (overwriting is only offered there), a successful one
 * rebases the draft onto the hash the server returned so a quick second
 * save cannot conflict with itself, and tabs follow renames and deletes.
 */
export function createProjectFileActions(deps: ProjectActionDeps): ProjectFileActions {
  const {
    workflowId,
    target,
    client,
    notify,
    getBaseline,
    getStore,
    getProjectPaths,
    ownerOf,
    saveSteps,
    commit,
    refresh,
    onShowImporters,
    canEdit,
  } = deps
  const isCurrent = deps.isCurrent ?? (() => true)
  const pending = deps.pending
  // Pending changes a batch wrote, settled once its refetch has landed.
  let justSaved: { op: PendingFileOp; written?: FileOpSaved['written'] }[] = []
  const specifierOf = deps.importSpecifierOf ?? importSpecifier
  const isStep = (path: string) => ownerOf(path) === 'step'

  // After a batch of file writes has landed: the version records the files
  // as they are now, then the workspace reads everything back.
  async function settle(): Promise<void> {
    await commit()
    await refresh()
    if (pending && justSaved.length > 0) {
      const saved = justSaved
      justSaved = []
      pending.settle(saved)
    }
  }

  /** Writes one pending Explorer change (a new, renamed or deleted file). */
  async function saveFileOp(op: PendingFileOp): Promise<SaveOutcome> {
    const result = await pending!.save(op)
    if (result.status !== 'saved') return result.status
    justSaved.push({ op, ...(result.written && { written: result.written }) })
    return 'saved'
  }

  /** The pending change a save key names: a new or renamed file's path, or a delete key. */
  function pendingOpFor(key: string): PendingFileOp | undefined {
    if (!pending) return undefined
    const ops = getStore().fileOps
    const deleted = deletedPathOf(key)
    if (deleted !== null) return ops.find((op) => op.kind === 'delete' && op.path === deleted)
    return opAtPath(ops, key)
  }

  // The session store, or null when the workspace has moved on since the
  // action started. Called after every await, never cached across one.
  function liveStore(): IdeSessionState | null {
    return isCurrent() ? getStore() : null
  }

  async function write(
    path: string,
    source: string,
    precondition: WritePrecondition,
    reportConflict: boolean,
    verb = 'save',
  ): Promise<WriteOutcome> {
    try {
      return await client.putProjectFile(workflowId, path, source, precondition)
    } catch (err) {
      if (err instanceof ProjectFileConflictError && reportConflict) {
        // Not a toast: it would time out while the file still cannot be
        // saved. The editor shows a banner until Compare settles it.
        liveStore()?.setConflict(path, { currentHash: err.currentHash })
        // Bring in what the server holds now, so Compare and the banner
        // describe the file as it is rather than as it was last loaded.
        await refresh()
        return 'conflict'
      }
      failed(notify, `Couldn’t ${verb} ${basename(path)}`, err)
      return err instanceof ProjectFileConflictError ? 'conflict' : 'failed'
    }
  }

  async function overwriteFile(path: string, serverHash: string | null): Promise<boolean> {
    if (!canEdit()) return false
    const store = liveStore()
    if (!store || store.drafts[path] === undefined) return false
    if (withoutErrors([path]).length === 0) return false
    if (isStep(path)) {
      // Compare showed the node's code as the workspace has it; keeping yours
      // means saving over exactly that, so the draft is rebased onto its hash
      // and posted. A node that moved on again since is a fresh conflict.
      if (serverHash !== null) store.rebaseDraft(path, serverHash)
      const outcome = (await saveSteps([path])).get(path)
      if (outcome === 'conflict') showConflict(path)
      return outcome === 'saved'
    }
    const source = store.drafts[path]!.source
    const precondition: WritePrecondition = serverHash
      ? { ifMatch: serverHash }
      : { ifNoneMatch: true }
    const saved = await write(path, source, precondition, true)
    if (typeof saved === 'string') return false
    liveStore()?.rebaseDraft(path, saved.hash)
    await settle()
    return true
  }

  // 'unchanged' is a draft that matches the file (or a stored file with no
  // draft): nothing to send, and nothing wrong either.
  async function saveOne(path: string): Promise<SaveOutcome> {
    // A new, renamed or deleted file is written by its pending change.
    const fileOp = pendingOpFor(path)
    if (fileOp) return saveFileOp(fileOp)
    if (deletedPathOf(path) !== null) return 'unchanged'
    // Step code is routed before any file logic: it is never PUT.
    if (isStep(path)) {
      // The pending graph edits go with it (its node may be one of them): a
      // new step's file with no typed code is saved by its Add.
      const outcomes = await saveSteps([path])
      const own = outcomes.get(path) ?? 'failed'
      return own === 'unchanged' && outcomes.get(GRAPH_EDITS_KEY) === 'saved' ? 'saved' : own
    }
    const base = getBaseline().get(path)
    const draft = getStore().drafts[path]
    if (!draft && !base) return 'failed'
    // Edits of a file someone deleted: writing against its old hash can only
    // be refused, and recreating it is a choice the banner offers, not a side
    // effect of Save.
    if (draft && !base && draft.baseHash !== null) return 'deleted'
    if (draft && base && draft.source === base.source) {
      getStore().clearDraft(path)
      return 'unchanged'
    }
    // Without a draft only a virtual seed (no hash yet) has anything to save.
    if (!draft && base?.hash !== undefined) return 'unchanged'
    const source = draft ? draft.source : base!.source
    const baseHash = draft ? draft.baseHash : (base?.hash ?? null)
    const precondition: WritePrecondition = baseHash ? { ifMatch: baseHash } : { ifNoneMatch: true }
    const saved = await write(path, source, precondition, true)
    if (typeof saved === 'string') return saved
    liveStore()?.rebaseDraft(path, saved.hash)
    return 'saved'
  }

  // A save of a deleted file does nothing by itself, so it says why and shows
  // the file, where the banner offers Save to recreate and Discard — or, for
  // a step whose node is gone from the canvas, Copy code and Discard.
  function announceDeleted(path: string) {
    if (!isCurrent()) return
    if (isStep(path)) {
      notify.error(`Couldn’t save ${basename(path)}`, {
        description: 'Its step was removed from the canvas. Copy the code or discard your copy.',
      })
    } else {
      notify.error(`${basename(path)} was deleted on the server`, {
        description: 'Save to recreate it from your copy, or discard your copy.',
      })
    }
    liveStore()?.openFile(path)
  }

  // A refused save is shown on the file's own tab, where its banner is. From
  // Compare it stays in Compare, which already holds the choice (overwrite or
  // take the server's), and says why nothing was written.
  function showConflict(path: string) {
    const store = liveStore()
    // A pending delete has no tab: its toast has said why.
    if (!store || deletedPathOf(path) !== null) return
    if (store.activePath === compareTabId(path)) {
      notify.error(`Couldn’t save ${basename(path)}`, {
        description:
          'It changed on the server. Keep yours and overwrite, or use the server version.',
      })
      return
    }
    store.openFile(path)
  }

  function importersOf(
    path: string,
    drafts: IdeSessionState['drafts'],
  ): { specifier: string; count: number } | null {
    const specifier = specifierOf(path)
    if (!specifier) return null
    // The same ownership rule as the Search view, so the count is its list.
    const files = toSearchFiles(overlayDrafts(getBaseline(), drafts).values(), getProjectPaths())
    return { specifier, count: countImporters(files, specifier) }
  }

  // Imports are not rewritten, so a rename that leaves some behind says so
  // and offers the list.
  function announceRename(to: string, importers: { specifier: string; count: number } | null) {
    if (!importers || importers.count === 0) {
      notify.success(`Renamed to ${basename(to)}`)
      return
    }
    const { specifier, count } = importers
    notify.success(`Renamed to ${basename(to)}`, {
      description: `${count === 1 ? '1 file still imports' : `${count} files still import`} the old path.`,
      ...(onShowImporters && {
        action: { label: 'Show', onClick: () => onShowImporters(specifier) },
      }),
    })
  }

  /** One file's delete: no refresh, no toast, so a folder can do many and say it once. */
  async function removeFile(path: string): Promise<boolean> {
    // A step's source is not a file: deleting the step is the canvas's job.
    if (isStep(path)) return false
    const base = getBaseline().get(path)
    const draft = getStore().drafts[path]
    // A draft built on no stored version (a virtual seed, or one restored
    // from a previous session) next to a stored file means the file appeared
    // after the edit began. Deleting it would remove text the person never
    // read, so it is settled in Compare first, like rename.
    if (draft && draft.baseHash === null && base?.hash) {
      notify.error(`Couldn’t delete ${basename(path)}`, {
        description: 'It changed on the server since you edited it. Compare it first.',
      })
      liveStore()?.openFile(path)
      return false
    }
    // The version the person read: a file that moved on under their edits is
    // refused with the server's reason instead of deleted unseen. Decided by
    // whether a draft exists, never by falling back to the newest hash.
    const ifMatch = draft ? draft.baseHash : base?.hash
    // No stored hash: nothing on the server to delete, only the local copy.
    if (ifMatch) {
      try {
        await client.deleteProjectFile(workflowId, path, ifMatch)
      } catch (err) {
        failed(notify, `Couldn’t delete ${basename(path)}`, err)
        if (err instanceof ProjectFileConflictError) await refresh()
        return false
      }
    }
    const store = liveStore()
    store?.clearDraft(path)
    store?.closeFile(path)
    return true
  }

  // Files with errors stay drafts: the rest of the batch saves, and one
  // notice names what was held back.
  // Only a file with unsaved changes is judged: one with nothing to write is
  // no one's to hold back. Every write that sends a draft comes through here.
  function withoutErrors(paths: readonly string[]): string[] {
    const dirty = new Set(dirtyPaths(getBaseline(), getStore().drafts))
    const held = paths
      .filter((path) => dirty.has(path))
      .map((path) => ({ path, errors: deps.errorsIn?.(path) ?? 0 }))
      .filter((file) => file.errors > 0)
    if (held.length > 0) notify.error(heldBackMessage(held))
    const blocked = new Set(held.map((file) => file.path))
    return paths.filter((path) => !blocked.has(path))
  }

  async function saveFiles(paths: readonly string[]): Promise<boolean[]> {
    if (!canEdit()) return paths.map(() => false)
    const unique = withoutErrors([...new Set(paths)])
    const steps = unique.filter((path) => path === GRAPH_EDITS_KEY || isStep(path))
    const files = unique.filter((path) => path !== GRAPH_EDITS_KEY && !isStep(path))
    // Pending deletes land first: the server judges a new path against the
    // files it holds (a name compiling over another, the file cap).
    const deletes = files.filter((path) => deletedPathOf(path) !== null)
    const writes = files.filter((path) => deletedPathOf(path) === null)
    const deleteOutcomes = await Promise.all(deletes.map(saveOne))
    // The writes read the session's drafts and pending changes: if the person
    // has left meanwhile (Discard and leave, another workflow), they belong to
    // someone else's session now, and nothing more is written.
    if (deletes.length > 0 && !isCurrent()) return paths.map(() => false)
    const [stepOutcomes, writeOutcomes] = await Promise.all([
      steps.length > 0 ? saveSteps(steps) : NO_OUTCOMES,
      Promise.all(writes.map(saveOne)),
    ])
    const fileOutcomes = new Map<string, SaveOutcome>()
    deletes.forEach((path, index) => fileOutcomes.set(path, deleteOutcomes[index]!))
    writes.forEach((path, index) => fileOutcomes.set(path, writeOutcomes[index]!))
    const outcomes = new Map<string, SaveOutcome>(stepOutcomes)
    for (const [path, outcome] of fileOutcomes) outcomes.set(path, outcome)
    const firstConflict = unique.find((path) => outcomes.get(path) === 'conflict')
    if (firstConflict !== undefined) showConflict(firstConflict)
    const firstDeleted = unique.find((path) => outcomes.get(path) === 'deleted')
    if (firstDeleted !== undefined) announceDeleted(firstDeleted)
    // The step saver has refetched for its own write; the files need the
    // commit, once for the whole batch.
    if (files.some((path) => outcomes.get(path) === 'saved')) await settle()
    return paths.map((path) => outcomes.get(path) === 'saved')
  }

  return {
    async saveFile(path) {
      if (!canEdit()) return false
      if (withoutErrors([path]).length === 0) return false
      const outcome = await saveOne(path)
      // The banners live on the file's own tab.
      if (outcome === 'conflict') showConflict(path)
      if (outcome === 'deleted') announceDeleted(path)
      const ok = outcome === 'saved'
      // No toast: the dirty dot clearing is the confirmation, as in any editor.
      if (ok && !isStep(path)) await settle()
      return ok
    },

    overwriteFile,

    async recreateFile(path) {
      // A step's node is gone: its code can only be copied, not recreated here.
      if (!canEdit() || isStep(path)) return false
      const source = getStore().drafts[path]?.source
      if (source === undefined) return false
      if (withoutErrors([path]).length === 0) return false
      const saved = await write(path, source, { ifNoneMatch: true }, true)
      if (typeof saved === 'string') return false
      liveStore()?.rebaseDraft(path, saved.hash)
      await settle()
      return true
    },

    saveFiles,

    isHeldBack(path) {
      const dirty = dirtyPaths(getBaseline(), getStore().drafts).includes(path)
      return dirty && (deps.errorsIn?.(path) ?? 0) > 0
    },

    // The pending graph edits count one each, as the unsaved count shows them;
    // a pending Explorer change counts once, typed text in its file included.
    async saveAll() {
      const store = getStore()
      const graphEdits = waitingOps(store.graphOps).length
      const paths = [
        ...new Set([...dirtyPaths(getBaseline(), store.drafts), ...fileOpSaveKeys(store.fileOps)]),
      ]
      const results = await saveFiles(graphEdits > 0 ? [...paths, GRAPH_EDITS_KEY] : paths)
      return results.reduce(
        (count, saved, index) =>
          saved ? count + (paths[index] === undefined ? graphEdits : 1) : count,
        0,
      )
    },

    async createFile(path, source) {
      if (!canEdit()) return false
      // A new handler entry starts from its scaffold: an empty
      // handlers/fetch.ts would take over the HTTP entry and answer
      // nothing, and a new file row is how the docs say to add one.
      const entry = handlerEntry(path)
      const initial =
        source ??
        (entry
          ? handlerModuleScaffold(entry.kind === 'fetch' ? { kind: 'fetch', target } : entry)
          : '')
      if (pending) {
        if (!pending.create(path, initial)) return false
        getStore().openFile(path)
        const specifier = specifierOf(path)
        if (specifier) {
          notify.success(`Import it as \`${specifier}\``, {
            action: copyImportAction(specifier, notify),
          })
        }
        return true
      }
      const created = await write(path, initial, { ifNoneMatch: true }, false, 'create')
      // A conflict means someone else created it first: show their file.
      if (created === 'conflict') await refresh()
      if (typeof created === 'string') return false
      await settle()
      liveStore()?.openFile(path)
      const specifier = specifierOf(path)
      notify.success(
        specifier ? `Created. Import it as \`${specifier}\`` : `Created ${basename(path)}`,
        specifier ? { action: copyImportAction(specifier, notify) } : undefined,
      )
      return true
    },

    async renameFile(from, to) {
      if (!canEdit() || isStep(from)) return false
      if (pending) {
        // Counted before the move, over what the editor shows.
        const importers = importersOf(from, getStore().drafts)
        if (!pending.rename(from, to)) return false
        announceRename(to, importers)
        return true
      }
      const base = getBaseline().get(from)
      // The editor as it stood when the rename began: the count below must
      // not mix this workflow's baseline with another one's drafts.
      const drafts = getStore().drafts
      const draft = drafts[from]
      const source = draft?.source ?? base?.source
      if (source === undefined) return false
      // A rename writes the draft at the new path: held back like a save.
      if (withoutErrors([from]).length === 0) return false
      // The copy at the new path is the person's text, built on the version
      // they read. If the file has moved on since (or a save was refused), the
      // rename would carry their text over and drop a version they never saw,
      // so nothing is written until Compare or Discard settles the file.
      if (outsideState(getBaseline(), from, draft) !== null || getStore().conflicts[from]) {
        notify.error(`Couldn’t rename ${basename(from)}`, {
          description: 'It changed on the server since you edited it. Compare it first.',
        })
        liveStore()?.openFile(from)
        return false
      }
      const created = await write(to, source, { ifNoneMatch: true }, false, 'create')
      if (created === 'conflict') await refresh()
      if (typeof created === 'string') return false
      let removed = true
      // The version the person read (the guard above has already refused a
      // draft that is not built on the stored file), never the latest seen.
      const readHash = draft ? draft.baseHash : base?.hash
      if (readHash) {
        try {
          // A newer version that lands now is kept and reported.
          await client.deleteProjectFile(workflowId, from, readHash)
        } catch (err) {
          removed = false
          // Half done: the line says which half, the server's reason (if any) why.
          const reason = failureLine(err, '')
          notify.error(
            `Created ${basename(to)} but couldn’t remove ${basename(from)}`,
            reason ? { description: reason } : undefined,
          )
        }
      }
      // Counted before the move, over what the editor shows, so the answer is
      // the files that import the old path whether or not they are saved yet.
      const importers = removed ? importersOf(from, drafts) : null
      const store = liveStore()
      store?.moveFile(from, to)
      store?.clearDraft(to)
      await settle()
      if (removed) announceRename(to, isCurrent() ? importers : null)
      return true
    },

    async deleteFile(path) {
      if (!canEdit()) return false
      if (pending) return pending.remove(path)
      if (!(await removeFile(path))) return false
      await settle()
      notify.success(`Deleted ${basename(path)}`)
      return true
    },

    async deleteFolder(dir) {
      if (!canEdit()) return false
      const prefix = `${dir}/`
      // Step sources under the folder are not files and are left alone.
      const inFolder = (p: string) => p.startsWith(prefix) && !isStep(p)
      if (pending) {
        const onScreen = new Set(
          [...getBaseline().keys(), ...Object.keys(getStore().drafts)].filter(inFolder),
        )
        return [...onScreen].map((p) => pending.remove(p)).every(Boolean)
      }
      const stored = [...getBaseline()].filter(([p, f]) => inFolder(p) && f.hash !== undefined)
      const paths = new Set([
        ...stored.map(([p]) => p),
        ...Object.keys(getStore().drafts).filter(inFolder),
      ])
      const results = await Promise.all([...paths].map(removeFile))
      const removed = results.filter(Boolean).length
      // Only a delete that landed is something to record; refused ones are
      // read back so each file shows why.
      if (removed > 0) await settle()
      else await refresh()
      const name = basename(dir)
      if (removed === paths.size) {
        notify.success(`Deleted ${name}`)
        return true
      }
      notify.error(`Deleted ${removed} of ${paths.size} files in ${name}`, {
        description: 'The rest are still here. Check the message on each, then try again.',
      })
      return false
    },

    async convertHandlers() {
      if (!canEdit()) return null
      // The server converts the files it holds: pending Explorer changes
      // would be converted around, not with.
      if (pending && getStore().fileOps.length > 0) {
        notify.error('Save your file changes first', {
          description: 'The conversion works on the saved files.',
        })
        return null
      }
      // The server converts what it has stored; an unsaved draft of the
      // annotation file would be lost, so it is saved first.
      let savedFirst = false
      if (getStore().drafts[PROJECT_HANDLERS_PATH]) {
        if (withoutErrors([PROJECT_HANDLERS_PATH]).length === 0) return null
        const outcome = await saveOne(PROJECT_HANDLERS_PATH)
        if (outcome !== 'saved' && outcome !== 'unchanged') return null
        savedFirst = outcome === 'saved'
      }
      // The hash the conversion is conditional on is read after that save:
      // a saved draft now builds on the hash the server returned.
      const current = liveStore()
      if (!current) return null
      const handlersDraft = current.drafts[PROJECT_HANDLERS_PATH]
      const hash = handlersDraft
        ? (handlersDraft.baseHash ?? undefined)
        : getBaseline().get(PROJECT_HANDLERS_PATH)?.hash
      let result: HandlerConversionResult
      try {
        result = await client.convertHandlers(workflowId, hash)
      } catch (err) {
        failed(notify, `Couldn’t convert ${PROJECT_HANDLERS_PATH}`, err)
        // The save that preceded a failed conversion still landed: it is
        // recorded and read back like any other write.
        if (savedFirst) await settle()
        else if (err instanceof ProjectFileConflictError) await refresh()
        return null
      }
      const store = liveStore()
      store?.clearDraft(PROJECT_HANDLERS_PATH)
      store?.closeFile(PROJECT_HANDLERS_PATH)
      await settle()
      if (result.files[0]) liveStore()?.openFile(result.files[0].path)
      notify.success(
        result.files.length === 1
          ? `Created ${result.files[0]!.path}`
          : `Created ${result.files.length} handler modules`,
      )
      return result
    },
  }
}
