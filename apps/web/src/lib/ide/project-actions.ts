import { PROJECT_HANDLERS_PATH, handlerEntry } from '@awaitstep/ir'
import { failureLine } from '../action-toast'
import { handlerModuleScaffold, type HandlerTarget } from '@awaitstep/provider-cloudflare/codegen'
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
import { importSpecifier } from './project'
import { countImporters, toSearchFiles } from './search'

export interface ProjectFileClient {
  putProjectFile(
    workflowId: string,
    path: string,
    source: string,
    precondition: WritePrecondition,
  ): Promise<ProjectFileSummary>
  deleteProjectFile(workflowId: string, path: string, ifMatch?: string): Promise<void>
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
  /** The project's own paths (stored files and virtual seeds); every other file is generated. */
  getProjectPaths: () => ReadonlySet<string>
  /** Refetches the workspace once a write has landed. */
  refresh: () => Promise<void>
  /** Opens Search on the old import path after a rename that left importers behind. */
  onShowImporters?: (specifier: string) => void
}

export interface ProjectFileActions {
  /** Saves one file; false when there was nothing to save or the write was refused. */
  saveFile(path: string): Promise<boolean>
  /** Saves every dirty draft; resolves to how many were written. */
  saveAll(): Promise<number>
  createFile(path: string, source?: string): Promise<boolean>
  renameFile(from: string, to: string): Promise<boolean>
  deleteFile(path: string): Promise<boolean>
  /**
   * Splits the annotation file (or the legacy trigger-code setting) into
   * handler modules. The server does the whole conversion in one request —
   * modules written together, the file removed, the setting cleared, crons
   * and queue settings folded into the deployment config — so a failure
   * never leaves the project half converted.
   */
  convertHandlers(): Promise<HandlerConversionResult | null>
}

type WriteOutcome = ProjectFileSummary | 'conflict' | 'failed'

/** A failed write's toast: the server's reason, or `line` when it gave none (see `failureLine`). */
function failed(notify: Notifier, line: string, err: unknown) {
  notify.error(failureLine(err, line))
}

/**
 * The workspace's writes, with the bookkeeping that keeps them safe for a
 * file an agent may be editing at the same time: every write is conditional
 * on the hash the draft started from (or on the path being free), a refused
 * write surfaces as a conflict with an explicit Overwrite, a successful one
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
    refresh,
    onShowImporters,
  } = deps
  const isCurrent = deps.isCurrent ?? (() => true)

  // The session store, or null when the workspace has moved on since the
  // action started. Called after every await, never cached across one.
  function liveStore(): IdeSessionState | null {
    return isCurrent() ? getStore() : null
  }

  async function write(
    path: string,
    source: string,
    precondition: WritePrecondition,
    offerOverwrite: boolean,
    verb = 'save',
  ): Promise<WriteOutcome> {
    try {
      return await client.putProjectFile(workflowId, path, source, precondition)
    } catch (err) {
      if (err instanceof ProjectFileConflictError && offerOverwrite) {
        const { currentHash } = err
        const what = 'ifNoneMatch' in precondition ? 'was created' : 'changed'
        notify.error(`${basename(path)} ${what} on the server since you opened it`, {
          description: 'Reload to see the latest version, or overwrite it with your copy.',
          action: {
            label: 'Overwrite',
            onClick: () => {
              void overwrite(path, currentHash)
            },
          },
        })
        return 'conflict'
      }
      failed(notify, `Couldn’t ${verb} ${basename(path)}`, err)
      return err instanceof ProjectFileConflictError ? 'conflict' : 'failed'
    }
  }

  // Overwrites against the hash the conflict reported: anything that lands
  // in between is a fresh conflict, never a silent clobber.
  async function overwrite(path: string, currentHash: string | null): Promise<void> {
    // Reached from a toast long after the click that made it.
    const store = liveStore()
    if (!store) return
    const source = store.drafts[path]?.source ?? getBaseline().get(path)?.source
    if (source === undefined) return
    const precondition: WritePrecondition = currentHash
      ? { ifMatch: currentHash }
      : { ifNoneMatch: true }
    const saved = await write(path, source, precondition, true)
    if (typeof saved === 'string') return
    liveStore()?.rebaseDraft(path, saved.hash)
    await refresh()
    notify.success(`Saved ${basename(path)}`)
  }

  // 'unchanged' is a draft that matches the file (or a stored file with no
  // draft): nothing to send, and nothing wrong either.
  async function saveOne(path: string): Promise<'saved' | 'unchanged' | 'failed'> {
    const base = getBaseline().get(path)
    const draft = getStore().drafts[path]
    if (!draft && !base) return 'failed'
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
    if (typeof saved === 'string') return 'failed'
    liveStore()?.rebaseDraft(path, saved.hash)
    return 'saved'
  }

  function importersOf(
    path: string,
    drafts: IdeSessionState['drafts'],
  ): { specifier: string; count: number } | null {
    const specifier = importSpecifier(path)
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

  return {
    async saveFile(path) {
      const ok = (await saveOne(path)) === 'saved'
      if (ok) {
        await refresh()
        notify.success(`Saved ${basename(path)}`)
      }
      return ok
    },

    async saveAll() {
      const paths = dirtyPaths(getBaseline(), getStore().drafts)
      const results = await Promise.all(paths.map(saveOne))
      const saved = results.filter((r) => r === 'saved').length
      if (saved > 0) {
        await refresh()
        notify.success(saved === 1 ? 'Saved 1 file' : `Saved ${saved} files`)
      }
      return saved
    },

    async createFile(path, source) {
      // A new handler entry starts from its scaffold: an empty
      // handlers/fetch.ts would take over the HTTP entry and answer
      // nothing, and a new file row is how the docs say to add one.
      const entry = handlerEntry(path)
      const initial =
        source ??
        (entry
          ? handlerModuleScaffold(entry.kind === 'fetch' ? { kind: 'fetch', target } : entry)
          : '')
      const created = await write(path, initial, { ifNoneMatch: true }, false, 'create')
      // A conflict means someone else created it first: show their file.
      if (created === 'conflict') await refresh()
      if (typeof created === 'string') return false
      await refresh()
      liveStore()?.openFile(path)
      const specifier = importSpecifier(path)
      notify.success(
        specifier ? `Created. Import it as \`${specifier}\`` : `Created ${basename(path)}`,
      )
      return true
    },

    async renameFile(from, to) {
      const base = getBaseline().get(from)
      // The editor as it stood when the rename began: the count below must
      // not mix this workflow's baseline with another one's drafts.
      const drafts = getStore().drafts
      const draft = drafts[from]
      const source = draft?.source ?? base?.source
      if (source === undefined) return false
      const created = await write(to, source, { ifNoneMatch: true }, false, 'create')
      if (created === 'conflict') await refresh()
      if (typeof created === 'string') return false
      let removed = true
      if (base?.hash !== undefined) {
        try {
          await client.deleteProjectFile(workflowId, from, base.hash)
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
      await refresh()
      if (removed) announceRename(to, isCurrent() ? importers : null)
      return true
    },

    async deleteFile(path) {
      const base = getBaseline().get(path)
      try {
        await client.deleteProjectFile(workflowId, path, base?.hash)
      } catch (err) {
        failed(notify, `Couldn’t delete ${basename(path)}`, err)
        if (err instanceof ProjectFileConflictError) await refresh()
        return false
      }
      const store = liveStore()
      store?.clearDraft(path)
      store?.closeFile(path)
      await refresh()
      notify.success(`Deleted ${basename(path)}`)
      return true
    },

    async convertHandlers() {
      // The server converts what it has stored; an unsaved draft of the
      // annotation file would be lost, so it is saved first.
      if (getStore().drafts[PROJECT_HANDLERS_PATH]) {
        if ((await saveOne(PROJECT_HANDLERS_PATH)) === 'failed') return null
      }
      // The hash the conversion is conditional on is read after that save:
      // a saved draft now builds on the hash the server returned.
      const current = liveStore()
      if (!current) return null
      const hash =
        current.drafts[PROJECT_HANDLERS_PATH]?.baseHash ??
        getBaseline().get(PROJECT_HANDLERS_PATH)?.hash
      let result: HandlerConversionResult
      try {
        result = await client.convertHandlers(workflowId, hash)
      } catch (err) {
        failed(notify, `Couldn’t convert ${PROJECT_HANDLERS_PATH}`, err)
        if (err instanceof ProjectFileConflictError) await refresh()
        return null
      }
      const store = liveStore()
      store?.clearDraft(PROJECT_HANDLERS_PATH)
      store?.closeFile(PROJECT_HANDLERS_PATH)
      await refresh()
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
