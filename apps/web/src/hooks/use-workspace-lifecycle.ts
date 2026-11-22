import { useEffect } from 'react'
import { actionToast, failureLine } from '../lib/action-toast'
import type { ArtifactIR } from '@awaitstep/ir'
import type { DraftUndo } from '../lib/ide/draft-undo'
import { pruneGraphOps } from '../lib/ide/graph-ops-actions'
import type { LoadedVersion } from '../lib/ide/node-source'
import { missingNodeMessage, type MissingNode } from '../lib/ide/missing-node'
import { normalizeBundlePath } from '../lib/ide/file-tree'
import { buildWorkflowStoreState } from '../lib/hydrate-workflow'
import type { SourceFile, WorkflowFull, WorkflowSource } from '../lib/api-client'
import { useIdeSearchStore } from '../stores/ide-search-store'
import { useIdeExplorerStore } from '../stores/ide-explorer-store'
import { useIdeStore } from '../stores/ide-store'
import { useIdeStepsStore } from '../stores/ide-steps-store'
import { useQuickTestStore } from '../stores/quick-test-store'
import { clearWorkflowHistory, useWorkflowStore } from '../stores/workflow-store'
import { useCompareCache } from './use-compare-cache'
import { useDraftPersistence } from './use-draft-persistence'
import { useOutsideChanges } from './use-outside-changes'

interface DraftSyncInput {
  workflowId: string
  versionParam: string | undefined
  /** Both queries have answered, so `baseline` is complete (files and step sources). */
  loaded: boolean
  isHistorical: boolean
  canEdit: boolean
  baseline: ReadonlyMap<string, SourceFile>
  /** The stored project files only: what the listing the poll reads can speak about. */
  storedFiles: ReadonlyMap<string, SourceFile>
}

/**
 * Keeps drafts in step with the outside world: files another writer changed
 * while this is open, and the browser's stored copy of unsaved edits.
 *
 * Effect cleanups run in declaration order on unmount, and the session reset
 * in `useWorkspaceLifecycle` must come after these, so call this first.
 */
export function useWorkspaceDraftSync({
  workflowId,
  versionParam,
  loaded,
  isHistorical,
  canEdit,
  baseline,
  storedFiles,
}: DraftSyncInput): void {
  // Notices files another writer changed (a teammate, an agent) and versions
  // the canvas saved while this is open.
  useOutsideChanges({
    workflowId,
    versionParam,
    enabled: loaded && !isHistorical,
    stored: storedFiles,
  })

  useDraftPersistence({
    workflowId,
    enabled: canEdit,
    baseline: loaded ? baseline : null,
  })
}

interface LifecycleInput {
  workflowId: string
  fileParam: string | undefined
  fullData: WorkflowFull | undefined
  /** The loaded version as stored, before Code's pending graph edits. */
  savedVersion: LoadedVersion | null
  /** An older version is shown: it never holds pending edits, so nothing is pruned against it. */
  isHistorical: boolean
  /** The loaded version with the pending graph edits replayed; null without one. */
  editedDoc: ArtifactIR | null
  fullError: Error | null
  sourceError: Error | null
  /** The custom node the source could not be built for, when that is why its first load failed. */
  missingNode: MissingNode | null
  /** Leaves Code for the canvas with the missing node selected. */
  onMissingNode: (node: MissingNode) => void
  source: WorkflowSource | undefined
  baseline: ReadonlyMap<string, SourceFile>
  ghostPaths: string[]
  draftUndo: DraftUndo
}

/**
 * The workspace's mount and unmount work: hydrate the canvas store, drop what
 * the session holds when it closes, and keep tabs and drafts consistent with
 * the loaded bundle.
 *
 * The order of the effects is load-bearing. Their cleanups run in declaration
 * order, so the compare cache is emptied here before the session reset, and
 * `useWorkspaceDraftSync` (called before this) has unsubscribed before the
 * reset, or the reset's empty drafts would be written over what the next
 * visit should restore.
 */
export function useWorkspaceLifecycle({
  workflowId,
  fileParam,
  fullData,
  savedVersion,
  isHistorical,
  editedDoc,
  fullError,
  sourceError,
  missingNode,
  onMissingNode,
  source,
  baseline,
  ghostPaths,
  draftUndo,
}: LifecycleInput): void {
  const openFile = useIdeStore((s) => s.openFile)
  const pruneFiles = useIdeStore((s) => s.pruneFiles)
  const reconcileDrafts = useIdeStore((s) => s.reconcileDrafts)

  // Hydrate the canvas store (always read-only here) so Monaco's per-workflow
  // ambient types — typed Env, node outputs, runGraph — apply in the IDE too.
  // Store sync from query data follows the canvas route's established pattern.
  // The graph is the loaded version with Code's pending edits replayed, so the
  // Steps list, inspector and map show them before they are saved.
  useEffect(() => {
    if (!fullData?.workflow) return
    const version =
      fullData.version && editedDoc && editedDoc !== savedVersion?.doc
        ? { ...fullData.version, ir: JSON.stringify(editedDoc) }
        : fullData.version
    useWorkflowStore.getState().setWorkflowId(workflowId)
    useWorkflowStore.setState(
      buildWorkflowStoreState(fullData.workflow, version, fullData.version?.version ?? 0, true, {
        handlerModules: fullData.handlers.modules,
        graphHash: fullData.graphHash,
      }),
    )
    // The builder leaves the graph alone when there is no version, so a graph
    // the canvas left in the store (drawn, then discarded to switch here)
    // would show through. The IDE never edits it: no version means no graph.
    if (!fullData.version) {
      useWorkflowStore.setState({ nodes: [], edges: [], selectedNodeId: null })
    }
    clearWorkflowHistory()
  }, [fullData, workflowId, editedDoc, savedVersion])

  // A version that landed underneath (the canvas saved, a refused save's
  // refetch) is the new base: pending edits that no longer apply to it go,
  // and the notice names them; the rest stay pending.
  useEffect(() => {
    if (savedVersion && !isHistorical)
      pruneGraphOps(useIdeStore.getState, savedVersion, actionToast)
  }, [savedVersion, isHistorical])

  useCompareCache(workflowId)

  useEffect(() => {
    return () => {
      draftUndo.dispose()
      useWorkflowStore.getState().reset()
      useIdeStore.getState().resetSession()
      useIdeExplorerStore.getState().reset()
      useIdeStepsStore.getState().reset()
      useIdeSearchStore.getState().reset()
      useQuickTestStore.getState().reset()
    }
  }, [draftUndo])

  // Keep tabs and drafts consistent with the loaded bundle (a refetch after
  // a save makes the saved draft redundant) and land on the deep-linked file
  // (or the primary file) when nothing is open yet. Both queries must have
  // answered: the baseline holds the step sources only once the version is in.
  const loaded = source !== undefined && fullData !== undefined
  useEffect(() => {
    if (!source || !loaded) return
    // Drafts first: a Compare tab goes once its file has no unsaved copy left.
    reconcileDrafts(baseline)
    pruneFiles([...baseline.keys(), ...ghostPaths])
    if (useIdeStore.getState().activePath !== null) return
    const requested = fileParam ? normalizeBundlePath(fileParam) : null
    // A workflow with no saved version has no generated entry to land on.
    const initial =
      requested && baseline.has(requested) ? requested : (source.primary ?? source.entry)
    if (initial && baseline.has(initial)) openFile(initial)
  }, [source, loaded, baseline, ghostPaths, fileParam, openFile, pruneFiles, reconcileDrafts])

  // A node the code can't be built for leaves Code for the canvas, which can
  // still show it: once per such failure, whatever else fails after it.
  useEffect(() => {
    if (!missingNode) return
    actionToast.error(missingNodeMessage(missingNode))
    onMissingNode(missingNode)
  }, [missingNode, onMissingNode])

  const loadError = fullError ?? sourceError
  useEffect(() => {
    if (loadError && !missingNode) {
      actionToast.error(failureLine(loadError, 'Couldn’t load the workflow source'))
    }
  }, [loadError, missingNode])
}
