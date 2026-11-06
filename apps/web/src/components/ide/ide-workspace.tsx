import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useBlocker } from '@tanstack/react-router'
import { actionToast } from '../../lib/action-toast'
import { createDraftUndo } from '../../lib/ide/draft-undo'
import { useQueries } from '../../contexts/api-client-context'
import { useMinWidth } from '../../hooks/use-min-width'
import { useProjectFiles } from '../../hooks/use-project-files'
import { useSearchActions } from '../../hooks/use-search-actions'
import { useWorkspaceActions } from '../../hooks/use-workspace-actions'
import { useWorkspaceData } from '../../hooks/use-workspace-data'
import { useWorkspaceDraftSync, useWorkspaceLifecycle } from '../../hooks/use-workspace-lifecycle'
import { useWorkspaceSession } from '../../hooks/use-workspace-session'
import { useIdeLayoutStore } from '../../stores/ide-layout-store'
import { useIdeStore } from '../../stores/ide-store'
import { IdeSkeleton } from './ide-skeleton'
import { NarrowWindowNotice } from './narrow-window-notice'
import { WorkspaceDialogs, WorkspaceUnsavedDialog } from './workspace-dialogs'
import { WorkspaceLayout } from './workspace-layout'
import { LoadFailure, UnsavedWorkflowNotice } from './workspace-notices'

interface IdeWorkspaceProps {
  workflowId: string
  versionParam?: string
  fileParam?: string
}

/** Below this the editor, explorer and dock cannot all be usable at once. */
const MIN_WORKSPACE_WIDTH = 960

export function IdeWorkspace({ workflowId, versionParam, fileParam }: IdeWorkspaceProps) {
  if (workflowId === 'new') return <UnsavedWorkflowNotice />
  // Keyed so navigating between workflows remounts: tabs, drafts, reveal
  // targets and the hydrated canvas store never leak from one workflow into
  // the next.
  return (
    <Workspace
      key={workflowId}
      workflowId={workflowId}
      versionParam={versionParam}
      fileParam={fileParam}
    />
  )
}

/**
 * Every hook runs before the early returns below it, so what is on screen
 * (skeleton, notice, workspace) never changes the order they run in. The
 * cleanups of the effects inside them run in this order on unmount: see
 * `useWorkspaceLifecycle`.
 */
function Workspace({ workflowId, versionParam, fileParam }: IdeWorkspaceProps) {
  const queries = useQueries()
  const data = useWorkspaceData(workflowId, versionParam)
  const { fullQuery, sourceQuery, fullData, source, baseline, files, dirty } = data
  const activePath = useIdeStore((s) => s.activePath)
  const convertDialogOpen = useIdeStore((s) => s.dialog === 'convertHandlers')
  // What the conversion will do, shown before it is confirmed. Observed here,
  // above the early returns, so the plan survives the dialogs unmounting.
  const conversionPreview = useQuery({
    ...queries.workflows.handlerConversion(workflowId),
    enabled: convertDialogOpen,
  })
  // Panel groups read their default layout once at mount; later drags flow
  // back through setLayout, so subscribing would only cause re-renders.
  const [initialLayouts] = useState(() => useIdeLayoutStore.getState().layouts)

  const draftUndo = useMemo(
    () =>
      createDraftUndo({
        getStore: useIdeStore.getState,
        notify: actionToast,
      }),
    [],
  )

  useWorkspaceDraftSync({
    workflowId,
    versionParam,
    loaded: data.loaded,
    isHistorical: data.isHistorical,
    canEdit: data.canEdit,
    baseline,
    storedFiles: data.storedFiles,
  })

  const searchActions = useSearchActions(files)
  const projectFiles = useProjectFiles({
    workflowId,
    versionParam,
    target: fullData?.workflow.kind === 'script' ? 'script' : 'workflow',
    baseline,
    projectPaths: data.projectPaths,
    ownerOf: data.ownerOf,
    hasVersion: data.hasVersion,
    canEdit: data.canEdit,
    onShowImporters: searchActions.showImporters,
  })

  useWorkspaceLifecycle({
    workflowId,
    fileParam,
    fullData,
    fullError: fullQuery.error,
    sourceError: sourceQuery.error,
    source,
    baseline,
    ghostPaths: data.ghostPaths,
    draftUndo,
  })

  const hasUnsaved = dirty.size > 0
  const wideEnough = useMinWidth(MIN_WORKSPACE_WIDTH)
  const blocker = useBlocker({
    shouldBlockFn: () => hasUnsaved,
    enableBeforeUnload: () => hasUnsaved,
    withResolver: true,
  })

  // The file as the editor has it, drafts included: a quick test runs what
  // is on screen, not what was last saved. Keyed on this file's own text
  // rather than the whole map, so a keystroke in another tab does not hand
  // the dock a new object to re-render for.
  const activeSource = activePath === null ? null : (files.get(activePath)?.source ?? null)
  const activeFile = useMemo(
    () =>
      activePath !== null && activeSource !== null
        ? { path: activePath, source: activeSource }
        : null,
    [activePath, activeSource],
  )

  const session = useWorkspaceSession({
    workflowId,
    currentVersionId: fullData?.workflow.currentVersionId ?? null,
    historical: data.isHistorical,
    storedHashes: data.storedHashes,
    activeFile,
    onSaveAll: projectFiles.saveAll,
  })

  const handlers = useWorkspaceActions({
    workflowId,
    versionParam,
    wideEnough,
    canEdit: data.canEdit,
    readOnlyMessage: data.workspace?.message ?? null,
    baseline,
    files,
    dirty,
    storedPaths: data.storedPaths,
    editabilityOf: data.editabilityOf,
    ownerOf: data.ownerOf,
    projectFiles,
    searchActions,
    draftUndo,
    sessionActions: session.actions,
  })

  if (fullQuery.isPending) return <IdeSkeleton />
  if (!fullData) {
    return <LoadFailure workflowId={workflowId} message={fullQuery.error?.message} />
  }
  if (sourceQuery.isPending) return <IdeSkeleton />
  if (!source || !data.workspace) {
    return <LoadFailure workflowId={workflowId} message={sourceQuery.error?.message} />
  }

  // Shown in the narrow-window notice too: the blocker still guards unsaved
  // drafts there, and a blocked navigation with no dialog is a dead end.
  const unsavedDialog = (
    <WorkspaceUnsavedDialog
      blocker={blocker}
      dirtyCount={dirty.size}
      canEdit={data.canEdit}
      wideEnough={wideEnough}
      saving={projectFiles.busy}
      saveAll={projectFiles.saveAll}
    />
  )
  if (!wideEnough) {
    return (
      <>
        <NarrowWindowNotice onOpenCanvas={handlers.handleOpenCanvas} onBack={handlers.handleBack} />
        {unsavedDialog}
      </>
    )
  }

  return (
    <WorkspaceLayout
      workflowId={workflowId}
      fullData={fullData}
      version={fullData.version}
      source={source}
      data={data}
      session={session}
      handlers={handlers}
      projectFiles={projectFiles}
      activeFile={activeFile}
      // Pinned only while actually reading an older version. Otherwise it names
      // whichever version is current right now, and the canvas would open that
      // one read-only the moment anything creates a newer one.
      linkVersion={data.isHistorical ? versionParam : undefined}
      initialLayouts={initialLayouts}
      dialogs={
        <>
          <WorkspaceDialogs
            storedPaths={data.storedPaths}
            projectFiles={projectFiles}
            conversionPreview={conversionPreview}
          />
          {unsavedDialog}
        </>
      }
    />
  )
}
