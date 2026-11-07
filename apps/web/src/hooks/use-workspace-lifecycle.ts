import { useEffect } from 'react'
import { actionToast, failureLine } from '../lib/action-toast'
import type { DraftUndo } from '../lib/ide/draft-undo'
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
  fullError: Error | null
  sourceError: Error | null
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
  fullError,
  sourceError,
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
  useEffect(() => {
    if (!fullData?.workflow) return
    useWorkflowStore.getState().setWorkflowId(workflowId)
    useWorkflowStore.setState(
      buildWorkflowStoreState(
        fullData.workflow,
        fullData.version,
        fullData.version?.version ?? 0,
        true,
        { handlerModules: fullData.handlers.modules, graphHash: fullData.graphHash },
      ),
    )
    // The builder leaves the graph alone when there is no version, so a graph
    // the canvas left in the store (drawn, then discarded to switch here)
    // would show through. The IDE never edits it: no version means no graph.
    if (!fullData.version) {
      useWorkflowStore.setState({ nodes: [], edges: [], selectedNodeId: null })
    }
    clearWorkflowHistory()
  }, [fullData, workflowId])

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

  const loadError = fullError ?? sourceError
  useEffect(() => {
    if (loadError) {
      actionToast.error(failureLine(loadError, 'Couldn’t load the workflow source'))
    }
  }, [loadError])
}
