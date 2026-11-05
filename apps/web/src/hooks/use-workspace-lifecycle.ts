import { useEffect } from 'react'
import { actionToast, failureLine } from '../lib/action-toast'
import type { DraftUndo } from '../lib/ide/draft-undo'
import { normalizeBundlePath } from '../lib/ide/file-tree'
import { buildWorkflowStoreState } from '../lib/hydrate-workflow'
import type { SourceFile, WorkflowFull, WorkflowSource } from '../lib/api-client'
import { useIdeSearchStore } from '../stores/ide-search-store'
import { useIdeExplorerStore } from '../stores/ide-explorer-store'
import { useIdeStore } from '../stores/ide-store'
import { useQuickTestStore } from '../stores/quick-test-store'
import { clearWorkflowHistory, useWorkflowStore } from '../stores/workflow-store'
import { useCompareCache } from './use-compare-cache'
import { useDraftPersistence } from './use-draft-persistence'
import { useOutsideChanges } from './use-outside-changes'

interface DraftSyncInput {
  workflowId: string
  source: WorkflowSource | undefined
  isHistorical: boolean
  canEdit: boolean
  baseline: ReadonlyMap<string, SourceFile>
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
  source,
  isHistorical,
  canEdit,
  baseline,
}: DraftSyncInput): void {
  // Notices files another writer changed (a teammate, an agent) while this is open.
  useOutsideChanges({ workflowId, enabled: source !== undefined && !isHistorical, baseline })

  useDraftPersistence({
    workflowId,
    enabled: canEdit,
    baseline: source ? baseline : null,
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
        { handlerModules: fullData.handlers.modules },
      ),
    )
    clearWorkflowHistory()
  }, [fullData, workflowId])

  useCompareCache(workflowId)

  useEffect(() => {
    return () => {
      draftUndo.dispose()
      useWorkflowStore.getState().reset()
      useIdeStore.getState().resetSession()
      useIdeExplorerStore.getState().reset()
      useIdeSearchStore.getState().reset()
      useQuickTestStore.getState().reset()
    }
  }, [draftUndo])

  // Keep tabs and drafts consistent with the loaded bundle (a refetch after
  // a save makes the saved draft redundant) and land on the deep-linked file
  // (or the primary file) when nothing is open yet.
  useEffect(() => {
    if (!source) return
    // Drafts first: a Compare tab goes once its file has no unsaved copy left.
    reconcileDrafts(baseline)
    pruneFiles([...baseline.keys(), ...ghostPaths])
    if (useIdeStore.getState().activePath !== null) return
    const requested = fileParam ? normalizeBundlePath(fileParam) : null
    const initial =
      requested && baseline.has(requested) ? requested : (source.primary ?? source.entry)
    if (baseline.has(initial)) openFile(initial)
  }, [source, baseline, ghostPaths, fileParam, openFile, pruneFiles, reconcileDrafts])

  // A workflow without any version has no source to show; that case renders
  // its own notice, so the source query's 400 is not an error worth toasting.
  const loadError = fullError ?? (fullData?.version ? sourceError : null)
  useEffect(() => {
    if (loadError) {
      actionToast.error(failureLine(loadError, 'Couldn’t load the workflow source'))
    }
  }, [loadError])
}
