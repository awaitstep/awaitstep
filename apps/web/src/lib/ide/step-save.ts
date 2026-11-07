import { contentHash } from '@awaitstep/ir'
import { normalizeStepModules } from '@awaitstep/codegen'
import { failureLine } from '../action-toast'
import { VersionConflictError, type SavedVersion } from '../api-client'
import type { IdeSessionState } from '../../stores/ide-store'
import { basename } from './file-tree'
import {
  applyStepSources,
  loadVersionDocument,
  stepCode,
  stepSources,
  type LoadedVersion,
  withoutFileSnapshot,
} from './node-source'

export interface StepSaveClient {
  createVersion(
    workflowId: string,
    data: { ir: unknown; baseGraphHash?: string },
  ): Promise<SavedVersion>
}

export interface StepSaveDeps {
  workflowId: string
  client: StepSaveClient
  notify: { error(message: string, options?: { description?: string }): void }
  getStore: () => IdeSessionState
  /** Still the workspace this saver was built for; see `ProjectActionDeps.isCurrent`. */
  isCurrent?: () => boolean
  /**
   * The version the workspace shows, read at save time (from the query
   * cache, so a refetch that has landed is seen at once). Null while there
   * is none, or the stored text cannot be read as a document.
   */
  getVersion: () => LoadedVersion | null
  /** Refetches the workspace once a version has been written (or refused). */
  refresh: () => Promise<void>
}

/**
 * What became of one step draft. `deleted`: its node is gone from the
 * canvas. `conflict`: the node's code moved since the draft began (a banner
 * offers Compare). `graph-conflict`: the server refused the version because
 * the graph moved; nothing was written, the drafts are kept.
 */
export type StepSaveOutcome =
  'saved' | 'unchanged' | 'conflict' | 'deleted' | 'graph-conflict' | 'failed'

export type StepSaveOutcomes = ReadonlyMap<string, StepSaveOutcome>

export interface StepSaver {
  /**
   * Saves the step drafts at `paths` as one version. Single-flight: calls
   * that arrive while a version is being written are merged into one
   * following write, so two quick saves never post two versions at once or
   * on the same base.
   */
  save(paths: readonly string[]): Promise<StepSaveOutcomes>
  /**
   * The document a write now would patch, including the last save's own
   * response while the refetch after it lags (or failed).
   */
  currentVersion(): LoadedVersion | null
  /**
   * Runs `work` after every save already asked for, with no save starting
   * until it settles — the gate a create shares with the saver, so a create
   * and a save can never post two versions on one base.
   */
  exclusive<T>(work: () => Promise<T>): Promise<T>
  /**
   * Records a version this workspace wrote outside `save` (a create), so the
   * next save builds on it while the cache still shows the base.
   */
  remember(baseGraphHash: string, version: LoadedVersion): void
  /** Drops the remembered version: the server has moved past the base it named. */
  forget(): void
}

function names(paths: readonly string[]): string {
  return paths.map(basename).join(', ')
}

/**
 * How Code saves step code: never a file write. The edited bodies are
 * written into the version document the workspace loaded — nothing else in
 * it is touched — and posted as the next version with that document's
 * `graphHash` as the base, so a canvas save that landed meanwhile is a
 * refusal, not a silent overwrite. Each draft is also checked against the
 * code its node has in that very document, exactly as a file draft is
 * checked against its file's hash: a moved node is a conflict banner before
 * anything is sent, and a vanished node is reported, not recreated.
 */
export function createStepSaver(deps: StepSaveDeps): StepSaver {
  const { workflowId, client, notify, getStore, getVersion, refresh } = deps
  const isCurrent = deps.isCurrent ?? (() => true)

  function liveStore(): IdeSessionState | null {
    return isCurrent() ? getStore() : null
  }

  // What this workspace wrote while the refetch after it lagged or failed:
  // the hash the cache still showed when the chain started, and the newest
  // document cut since. Every write in the chain is built on the one before
  // it, so while the cache still shows that first hash, the newest document
  // is the right base for the next write — not the cache's older copy. The
  // chain is dropped as soon as the cache shows anything else: the hash is
  // of the content, so a revert or a canvas save of an older graph can bring
  // a hash back, and it must then be read as the version it is.
  let lastSaved: {
    /** The hash the cache still showed when the chain started. */
    staleGraphHash: string
    /** The base of the most recent write: a late refetch can land on it. */
    lastBaseGraphHash: string
    version: LoadedVersion
  } | null = null

  function currentVersion(): LoadedVersion | null {
    const loaded = getVersion()
    if (!lastSaved) return loaded
    if (
      loaded?.graphHash === lastSaved.staleGraphHash ||
      loaded?.graphHash === lastSaved.lastBaseGraphHash
    ) {
      return lastSaved.version
    }
    lastSaved = null
    return loaded
  }

  /**
   * Records a version written on `baseGraphHash`. A write built on the
   * remembered document (or on the stale hash itself) extends the chain;
   * anything else starts a new one, since it was built on some other version.
   */
  function remember(baseGraphHash: string, version: LoadedVersion): void {
    if (lastSaved === null) {
      lastSaved = { staleGraphHash: baseGraphHash, lastBaseGraphHash: baseGraphHash, version }
      return
    }
    const extendsChain =
      lastSaved.version.graphHash === baseGraphHash ||
      lastSaved.staleGraphHash === baseGraphHash ||
      lastSaved.lastBaseGraphHash === baseGraphHash
    lastSaved = {
      staleGraphHash: extendsChain ? lastSaved.staleGraphHash : baseGraphHash,
      lastBaseGraphHash: baseGraphHash,
      version,
    }
  }

  function forget(): void {
    lastSaved = null
  }

  async function run(paths: readonly string[]): Promise<Map<string, StepSaveOutcome>> {
    const outcomes = new Map<string, StepSaveOutcome>()
    // A queued run starts later than its call: by then the person may have
    // left for another workflow, whose drafts the shared store now holds.
    if (!isCurrent()) {
      for (const path of paths) outcomes.set(path, 'failed')
      return outcomes
    }
    const store = getStore()
    const drafted = [...new Set(paths)].filter((path) => {
      if (store.drafts[path]) return true
      outcomes.set(path, 'unchanged')
      return false
    })
    if (drafted.length === 0) return outcomes

    const version = currentVersion()
    if (!version) {
      notify.error(`Couldn’t save ${names(drafted)}`, {
        description: 'Open this workflow on the canvas and save it once, then try again.',
      })
      for (const path of drafted) outcomes.set(path, 'failed')
      return outcomes
    }

    // Judged against the document that will be patched, not the rendered
    // baseline: right after a save the two differ until the refetch lands.
    const sources = stepSources(version.doc)
    const edits = new Map<string, string>()
    const edited: { path: string; code: string }[] = []
    for (const path of drafted) {
      const draft = store.drafts[path]!
      const nodeId = sources.byPath.get(path)
      const current = nodeId === undefined ? undefined : sources.byNode.get(nodeId)
      // The node is gone from the canvas (or was never one): nothing to patch.
      if (nodeId === undefined || !current) {
        outcomes.set(path, 'deleted')
        continue
      }
      if (draft.source === current.source) {
        store.clearDraft(path)
        outcomes.set(path, 'unchanged')
        continue
      }
      // The code the draft was edited from is not the node's code any more:
      // a banner, never a write over text the person has not read.
      if (draft.baseHash !== current.hash) {
        store.setConflict(path, { currentHash: current.hash ?? null })
        outcomes.set(path, 'conflict')
        continue
      }
      edits.set(nodeId, draft.source)
      edited.push({ path, code: draft.source })
    }
    if (edited.length === 0) return outcomes

    const editedPaths = edited.map((e) => e.path)
    // Posted in module form, as the server stores it: a body typed in place
    // of the module is wrapped here first, so what each draft is rebased on
    // is byte for byte what the refetch will show.
    const patched = normalizeStepModules(applyStepSources(version.doc, edits))
    const storedCode = new Map(
      edited.map(({ path, code }) => {
        const node = patched.nodes.find((n) => n.id === sources.byPath.get(path))
        return [path, node ? stepCode(node) : code]
      }),
    )
    let saved: SavedVersion
    try {
      saved = await client.createVersion(workflowId, {
        ir: withoutFileSnapshot(patched),
        baseGraphHash: version.graphHash,
      })
    } catch (err) {
      if (err instanceof VersionConflictError) {
        // Not a toast: the drafts stay refused until the workspace has caught
        // up. The notice explains; the refetch marks each draft whose node moved.
        liveStore()?.setGraphConflict({
          currentVersionId: err.currentVersionId,
          currentGraphHash: err.currentGraphHash,
          paths: editedPaths,
        })
        // Whatever the base was read from, the server has moved past it.
        forget()
        await refresh()
        for (const path of editedPaths) outcomes.set(path, 'graph-conflict')
        return outcomes
      }
      notify.error(failureLine(err, `Couldn’t save ${names(editedPaths)}`))
      for (const path of editedPaths) outcomes.set(path, 'failed')
      return outcomes
    }

    const live = liveStore()
    for (const { path, code } of edited) {
      // The draft now builds on the code the server holds, so a quick second
      // save cannot conflict with itself; the refetch then finds it clean. A
      // body the server wrapped is shown wrapped, as the file now is.
      const stored = storedCode.get(path) ?? code
      live?.rebaseDraft(path, contentHash(stored))
      // Only while the draft still holds what was posted: text typed since
      // the save went out is the person's, not ours to replace.
      if (stored !== code && live?.drafts[path]?.source === code) live.setDraft(path, stored, null)
      outcomes.set(path, 'saved')
    }
    live?.setGraphConflict(null)
    const next = loadVersionDocument({ version: saved, graphHash: saved.graphHash })
    if (next) remember(version.graphHash, next)
    else forget()
    await refresh()
    // A refetch that moved the workspace anywhere the chain does not explain
    // landed: the cache is the version to read from now on. The stale hash
    // (nothing answered) and the last write's base (an older refetch landed
    // late) both keep it.
    const cached = getVersion()?.graphHash
    if (
      lastSaved !== null &&
      cached !== lastSaved.staleGraphHash &&
      cached !== lastSaved.lastBaseGraphHash
    ) {
      forget()
    }
    return outcomes
  }

  // Nothing in `run` is expected to throw past its own handling; if something
  // does, the paths are reported failed rather than left hanging in a batch.
  // The general line, not the error's text: a bug's message is no reason a
  // person can act on.
  function guarded(paths: readonly string[]): Promise<Map<string, StepSaveOutcome>> {
    return run(paths).catch(() => {
      notify.error(`Couldn’t save ${names(paths)}`)
      return new Map(paths.map((path) => [path, 'failed' as const]))
    })
  }

  // One queue for every write this workspace makes to the version: saves
  // (merged while they wait) and the create's exclusive work. Tasks run one
  // at a time, in the order they were asked for.
  interface SaveTask {
    kind: 'save'
    paths: Set<string>
    result: Promise<StepSaveOutcomes>
    resolve: (outcomes: StepSaveOutcomes) => void
  }

  interface ExclusiveTask {
    kind: 'exclusive'
    work: () => Promise<unknown>
    resolve: (value: unknown) => void
    reject: (err: unknown) => void
  }

  type Task = SaveTask | ExclusiveTask

  const tasks: Task[] = []
  let draining = false

  async function drain(): Promise<void> {
    if (draining) return
    draining = true
    try {
      while (tasks.length > 0) {
        const task = tasks.shift()!
        if (task.kind === 'save') {
          // `guarded` reports its own failures; a save task always resolves.
          task.resolve(await guarded([...task.paths]))
          continue
        }
        try {
          task.resolve(await task.work())
        } catch (err) {
          task.reject(err)
        }
      }
    } finally {
      draining = false
    }
  }

  function enqueueSave(paths: readonly string[]): Promise<StepSaveOutcomes> {
    // Two quick saves become one following write; a task after them (a
    // create) is a barrier, so a save asked for later is not merged back
    // across it.
    const last = tasks[tasks.length - 1]
    if (last?.kind === 'save') {
      for (const path of paths) last.paths.add(path)
      return last.result
    }
    let resolve!: (outcomes: StepSaveOutcomes) => void
    const result = new Promise<StepSaveOutcomes>((res) => {
      resolve = res
    })
    tasks.push({ kind: 'save', paths: new Set(paths), result, resolve })
    void drain()
    return result
  }

  function enqueueExclusive<T>(work: () => Promise<T>): Promise<T> {
    let resolve!: (value: T) => void
    let reject!: (err: unknown) => void
    const result = new Promise<T>((res, rej) => {
      resolve = res
      reject = rej
    })
    tasks.push({
      kind: 'exclusive',
      work,
      resolve: resolve as (value: unknown) => void,
      reject,
    })
    void drain()
    return result
  }

  return {
    save: enqueueSave,
    currentVersion,
    exclusive: enqueueExclusive,
    remember,
    forget,
  }
}
