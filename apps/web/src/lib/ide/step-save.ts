import { contentHash } from '@awaitstep/ir'
import { failureLine } from '../action-toast'
import { VersionConflictError, type SavedVersion } from '../api-client'
import type { IdeSessionState } from '../../stores/ide-store'
import { basename } from './file-tree'
import {
  applyStepSources,
  loadVersionDocument,
  stepSources,
  withoutFileSnapshot,
  type LoadedVersion,
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

  // The version the last save produced, remembered against the base it was
  // built on. The refetch after a save may lag or fail; while the workspace
  // still shows that base, the save's own response is the newer document.
  // Dropped as soon as the workspace shows anything else: the hash is of the
  // content, so a later version can carry the base's hash again (a revert, a
  // canvas save of the old graph) and must then be read as what it is.
  let lastSaved: { baseGraphHash: string; version: LoadedVersion } | null = null

  function currentVersion(): LoadedVersion | null {
    const loaded = getVersion()
    if (!lastSaved) return loaded
    if (loaded?.graphHash === lastSaved.baseGraphHash) return lastSaved.version
    lastSaved = null
    return loaded
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
    let saved: SavedVersion
    try {
      saved = await client.createVersion(workflowId, {
        ir: withoutFileSnapshot(applyStepSources(version.doc, edits)),
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
        lastSaved = null
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
      // save cannot conflict with itself; the refetch then finds it clean.
      live?.rebaseDraft(path, contentHash(code))
      outcomes.set(path, 'saved')
    }
    live?.setGraphConflict(null)
    const next = loadVersionDocument({ version: saved, graphHash: saved.graphHash })
    lastSaved = next ? { baseGraphHash: version.graphHash, version: next } : null
    await refresh()
    // The refetch landed: the workspace reads its own version from now on.
    if (getVersion()?.graphHash !== version.graphHash) lastSaved = null
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

  let inFlight: Promise<void> | null = null
  let queued: { paths: Set<string>; result: Promise<StepSaveOutcomes> } | null = null

  function launch(paths: Iterable<string>): Promise<StepSaveOutcomes> {
    const result = guarded([...paths])
    const settled: Promise<void> = result.then(() => undefined)
    inFlight = settled
    void settled.then(() => {
      if (inFlight === settled) inFlight = null
    })
    return result
  }

  return {
    save(paths) {
      if (!inFlight) return launch(paths)
      if (!queued) {
        const merged = new Set(paths)
        const result = inFlight.then(() => {
          queued = null
          return launch(merged)
        })
        queued = { paths: merged, result }
        return result
      }
      for (const path of paths) queued.paths.add(path)
      return queued.result
    },
  }
}
