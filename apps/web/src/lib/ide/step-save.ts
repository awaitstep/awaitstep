import { contentHash } from '@awaitstep/ir'
import { applyGraphOps, normalizeStepModules } from '@awaitstep/codegen'
import { failureLine } from '../action-toast'
import { VersionConflictError, type SavedVersion } from '../api-client'
import type { IdeSessionState } from '../../stores/ide-store'
import { basename } from './file-tree'
import { describeDropped, opsOf, waitingOps, type PendingGraphOp } from './graph-ops'
import { announceDropped, closeDroppedAdds, replayBase } from './graph-ops-actions'
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
 * the graph moved; nothing was written, the drafts are kept. `partial`
 * (graph edits only): some no longer applied and were discarded, by name;
 * the rest were written.
 */
export type StepSaveOutcome =
  'saved' | 'unchanged' | 'conflict' | 'deleted' | 'graph-conflict' | 'failed' | 'partial'

export type StepSaveOutcomes = ReadonlyMap<string, StepSaveOutcome>

/**
 * The key a save's outcomes give the pending graph edits under, beside the
 * step paths: they are written in the same version. Never a file path (a
 * path never starts with a colon).
 */
export const GRAPH_EDITS_KEY = ':graph'

export interface StepSaver {
  /**
   * Saves the step drafts at `paths`, with every pending graph edit, as one
   * version (a draft may be the code of a node a pending edit adds). The
   * graph edits' outcome is under `GRAPH_EDITS_KEY` when there were any.
   * Single-flight: calls
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
}

/** The files a toast names; "your changes" when there are none (only graph edits). */
function names(paths: readonly string[]): string {
  const files = paths.filter((path) => path !== GRAPH_EDITS_KEY)
  return files.length === 0 ? 'your changes' : files.map(basename).join(', ')
}

/** The written edits, marked with the hash the screen replays them on until the refetch lands. */
function markPosted(
  all: readonly PendingGraphOp[],
  written: readonly PendingGraphOp[],
  shownHash: string,
): PendingGraphOp[] {
  const ids = new Set(written.map((entry) => entry.id))
  return all.map((entry) => {
    if (!ids.has(entry.id)) return entry
    const { saving: _done, ...rest } = entry
    return { ...rest, postedOn: shownHash }
  })
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
    const asked = [...new Set(paths)].filter((path) => path !== GRAPH_EDITS_KEY)
    // Every waiting graph edit goes with the save, asked for or not.
    const pending = waitingOps(getStore().graphOps)
    if (pending.length === 0 && !asked.some((path) => getStore().drafts[path])) {
      for (const path of asked) outcomes.set(path, 'unchanged')
      return outcomes
    }

    const saved = currentVersion()
    if (!saved) {
      const drafted = asked.filter((path) => getStore().drafts[path])
      notify.error(`Couldn’t save ${names(drafted)}`, {
        description: 'Open this workflow on the canvas and save it once, then try again.',
      })
      for (const path of asked) outcomes.set(path, drafted.includes(path) ? 'failed' : 'unchanged')
      if (pending.length > 0) outcomes.set(GRAPH_EDITS_KEY, 'failed')
      return outcomes
    }

    // The pending edits replayed on the saved version: the document on
    // screen. One that no longer applies goes (its file closes with it) and
    // is named; the rest save. Dropped before the drafts are read, so a
    // dropped Add's code is gone rather than reported as deleted.
    const replay = applyGraphOps(replayBase(saved, getStore().graphOps), opsOf(pending))
    const failed = new Set(replay.dropped.map((d) => pending[d.index]!.id))
    const applied = pending.filter((entry) => !failed.has(entry.id))
    if (failed.size > 0) {
      getStore().replaceGraphOps(getStore().graphOps.filter((entry) => !failed.has(entry.id)))
      closeDroppedAdds(
        getStore,
        pending.filter((entry) => failed.has(entry.id)),
      )
      announceDropped(getStore, describeDropped(pending, replay.dropped), notify)
    }
    const graphOutcome: StepSaveOutcome = failed.size > 0 ? 'partial' : 'saved'
    const version: LoadedVersion = { doc: replay.ir, graphHash: saved.graphHash }

    const store = getStore()
    const drafted = asked.filter((path) => {
      if (store.drafts[path]) return true
      outcomes.set(path, 'unchanged')
      return false
    })

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
    if (edited.length === 0 && applied.length === 0) {
      if (failed.size > 0) outcomes.set(GRAPH_EDITS_KEY, 'partial')
      return outcomes
    }

    const editedPaths = edited.map((e) => e.path)
    const what =
      editedPaths.length > 0
        ? names(editedPaths)
        : applied.length === 1
          ? 'the change'
          : 'the changes'
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
    // The hash the screen replays on: the cache's, which can still be older
    // than the base this posts on when an earlier refetch never landed.
    const shownHash = getVersion()?.graphHash ?? version.graphHash
    // The post carries these: until it settles they can't be discarded.
    markSaving(applied, true)
    let written: SavedVersion
    try {
      written = await client.createVersion(workflowId, {
        ir: withoutFileSnapshot(patched),
        baseGraphHash: version.graphHash,
      })
    } catch (err) {
      markSaving(applied, false)
      if (err instanceof VersionConflictError) {
        // Not a toast: the drafts and graph edits stay until the workspace
        // has caught up. The notice explains; the refetch marks each draft
        // whose node moved and drops each graph edit that no longer applies.
        const live = liveStore()
        live?.setGraphConflict({
          currentVersionId: err.currentVersionId,
          currentGraphHash: err.currentGraphHash,
          paths: editedPaths,
          // What this save already named as no longer applying stays named.
          ...(live?.graphConflict?.dropped && { dropped: live.graphConflict.dropped }),
        })
        // Whatever the base was read from, the server has moved past it.
        forget()
        await refresh()
        for (const path of editedPaths) outcomes.set(path, 'graph-conflict')
        if (applied.length > 0) outcomes.set(GRAPH_EDITS_KEY, 'graph-conflict')
        return outcomes
      }
      // A refusal's reason (an arm straight into a join) is the server's own:
      // the edits and drafts stay, to be fixed and saved again.
      notify.error(failureLine(err, `Couldn’t save ${what}`))
      for (const path of editedPaths) outcomes.set(path, 'failed')
      if (applied.length > 0) outcomes.set(GRAPH_EDITS_KEY, 'failed')
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
    if (live && applied.length > 0) {
      // Written: they stop being listed at once, and are replayed only on the
      // hash the screen shows, so it keeps them until the refetch shows the
      // new version (then they are dropped).
      live.replaceGraphOps(markPosted(live.graphOps, applied, shownHash))
      outcomes.set(GRAPH_EDITS_KEY, graphOutcome)
    }
    live?.setGraphConflict(null)
    const next = loadVersionDocument({ version: written, graphHash: written.graphHash })
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

  /** Marks (or clears) the edits a post in flight carries, in the live store. */
  function markSaving(entries: readonly PendingGraphOp[], saving: boolean): void {
    const live = liveStore()
    if (!live || entries.length === 0) return
    const ids = new Set(entries.map((entry) => entry.id))
    live.replaceGraphOps(
      live.graphOps.map((entry) => {
        if (!ids.has(entry.id)) return entry
        if (saving) return { ...entry, saving: true as const }
        const { saving: _done, ...rest } = entry
        return rest
      }),
    )
  }

  // Nothing in `run` is expected to throw past its own handling; if something
  // does, the paths are reported failed rather than left hanging in a batch.
  // The general line, not the error's text: a bug's message is no reason a
  // person can act on.
  function guarded(paths: readonly string[]): Promise<Map<string, StepSaveOutcome>> {
    return run(paths).catch(() => {
      // Nothing is in flight any more: what it carried can be discarded again.
      if (isCurrent()) markSaving(waitingOps(getStore().graphOps), false)
      notify.error(`Couldn’t save ${names(paths)}`)
      return new Map(paths.map((path) => [path, 'failed' as const]))
    })
  }

  // One queue for every write this workspace makes to the version. Saves
  // asked for while one is posting are merged into one following save, and
  // run one at a time, in order.
  interface SaveTask {
    paths: Set<string>
    result: Promise<StepSaveOutcomes>
    resolve: (outcomes: StepSaveOutcomes) => void
  }

  const tasks: SaveTask[] = []
  let draining = false

  async function drain(): Promise<void> {
    if (draining) return
    draining = true
    try {
      while (tasks.length > 0) {
        const task = tasks.shift()!
        // `guarded` reports its own failures; a save task always resolves.
        task.resolve(await guarded([...task.paths]))
      }
    } finally {
      draining = false
    }
  }

  function enqueueSave(paths: readonly string[]): Promise<StepSaveOutcomes> {
    // Two quick saves become one following write.
    const last = tasks[tasks.length - 1]
    if (last) {
      for (const path of paths) last.paths.add(path)
      return last.result
    }
    let resolve!: (outcomes: StepSaveOutcomes) => void
    const result = new Promise<StepSaveOutcomes>((res) => {
      resolve = res
    })
    tasks.push({ paths: new Set(paths), result, resolve })
    void drain()
    return result
  }

  return {
    save: enqueueSave,
    currentVersion,
  }
}
