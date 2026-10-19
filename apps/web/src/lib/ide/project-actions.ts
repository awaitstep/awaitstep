import { PROJECT_HANDLERS_PATH, handlerEntry } from '@awaitstep/ir'
import { handlerModuleScaffold, type HandlerTarget } from '@awaitstep/provider-cloudflare/codegen'
import {
  ProjectFileConflictError,
  type HandlerConversionResult,
  type ProjectFileSummary,
  type SourceFile,
  type WritePrecondition,
} from '../api-client'
import type { IdeSessionState } from '../../stores/ide-store'
import { dirtyPaths } from './drafts'
import { basename } from './file-tree'

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

export interface Notifier {
  success(message: string): void
  error(
    message: string,
    options?: { description?: string; action?: { label: string; onClick: () => void } },
  ): void
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
  /** Refetches the workspace once a write has landed. */
  refresh: () => Promise<void>
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

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
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
  const { workflowId, target, client, notify, getBaseline, getStore, refresh } = deps

  async function write(
    path: string,
    source: string,
    precondition: WritePrecondition,
    offerOverwrite: boolean,
  ): Promise<WriteOutcome> {
    try {
      return await client.putProjectFile(workflowId, path, source, precondition)
    } catch (err) {
      if (err instanceof ProjectFileConflictError && !err.sourceMode && offerOverwrite) {
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
      notify.error(errorMessage(err, `Could not save ${basename(path)}`))
      return err instanceof ProjectFileConflictError ? 'conflict' : 'failed'
    }
  }

  // Overwrites against the hash the conflict reported: anything that lands
  // in between is a fresh conflict, never a silent clobber.
  async function overwrite(path: string, currentHash: string | null): Promise<void> {
    const source = getStore().drafts[path]?.source ?? getBaseline().get(path)?.source
    if (source === undefined) return
    const precondition: WritePrecondition = currentHash
      ? { ifMatch: currentHash }
      : { ifNoneMatch: true }
    const saved = await write(path, source, precondition, true)
    if (typeof saved === 'string') return
    getStore().rebaseDraft(path, saved.hash)
    await refresh()
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
    getStore().rebaseDraft(path, saved.hash)
    return 'saved'
  }

  return {
    async saveFile(path) {
      const ok = (await saveOne(path)) === 'saved'
      if (ok) await refresh()
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
      // nothing, and the New file dialog is how the docs say to add one.
      const entry = handlerEntry(path)
      const initial =
        source ??
        (entry
          ? handlerModuleScaffold(entry.kind === 'fetch' ? { kind: 'fetch', target } : entry)
          : '')
      const created = await write(path, initial, { ifNoneMatch: true }, false)
      // A conflict means someone else created it first: show their file.
      if (created === 'conflict') await refresh()
      if (typeof created === 'string') return false
      await refresh()
      getStore().openFile(path)
      return true
    },

    async renameFile(from, to) {
      const base = getBaseline().get(from)
      const draft = getStore().drafts[from]
      const source = draft?.source ?? base?.source
      if (source === undefined) return false
      const created = await write(to, source, { ifNoneMatch: true }, false)
      if (created === 'conflict') await refresh()
      if (typeof created === 'string') return false
      if (base?.hash !== undefined) {
        try {
          await client.deleteProjectFile(workflowId, from, base.hash)
        } catch (err) {
          notify.error(
            `Created ${basename(to)} but could not remove ${basename(from)}: ${errorMessage(err, 'unknown error')}`,
          )
        }
      }
      const store = getStore()
      store.moveFile(from, to)
      store.clearDraft(to)
      await refresh()
      return true
    },

    async deleteFile(path) {
      const base = getBaseline().get(path)
      try {
        await client.deleteProjectFile(workflowId, path, base?.hash)
      } catch (err) {
        notify.error(errorMessage(err, `Could not delete ${basename(path)}`))
        if (err instanceof ProjectFileConflictError) await refresh()
        return false
      }
      const store = getStore()
      store.clearDraft(path)
      store.closeFile(path)
      await refresh()
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
      const hash =
        getStore().drafts[PROJECT_HANDLERS_PATH]?.baseHash ??
        getBaseline().get(PROJECT_HANDLERS_PATH)?.hash
      let result: HandlerConversionResult
      try {
        result = await client.convertHandlers(workflowId, hash)
      } catch (err) {
        notify.error(errorMessage(err, `${PROJECT_HANDLERS_PATH} could not be converted`))
        if (err instanceof ProjectFileConflictError) await refresh()
        return null
      }
      const store = getStore()
      store.clearDraft(PROJECT_HANDLERS_PATH)
      store.closeFile(PROJECT_HANDLERS_PATH)
      await refresh()
      if (result.files[0]) store.openFile(result.files[0].path)
      notify.success(
        result.files.length === 1
          ? `Created ${result.files[0]!.path}`
          : `Created ${result.files.length} handler modules`,
      )
      return result
    },
  }
}
