import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { useBlocker, useRouter } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Group, Panel, Separator } from 'react-resizable-panels'
import type { Layout, LayoutChangedMeta } from 'react-resizable-panels'
import { useShallow } from 'zustand/react/shallow'
import { actionToast, LONG_TOAST_MS, failureLine } from '../../lib/action-toast'
import type { IdeCommandActions } from '../../lib/ide/commands'
import { createDraftUndo } from '../../lib/ide/draft-undo'
import { dirtyPaths } from '../../lib/ide/drafts'
import { reviewOrder } from '../../lib/ide/review'
import { filePathOfTab } from '../../lib/ide/tabs'
import { countBySeverity, diagnosticProblems, groupProblems } from '../../lib/ide/problems'
import { fileEditability, workspaceEditability } from '../../lib/ide/editability'
import { basename, buildFileTree, normalizeBundlePath } from '../../lib/ide/file-tree'
import {
  fileOwner,
  projectUsage,
  splitWorkspaceFiles,
  virtualSeedFiles,
} from '../../lib/ide/project'
import { buildWorkflowStoreState, deriveReadOnlyState } from '../../lib/hydrate-workflow'
import { PROJECT_HANDLERS_PATH } from '@awaitstep/ir'
import { describeHandlerDeclarations, type SourceFile } from '../../lib/api-client'
import { queries } from '../../lib/queries'
import { surfaceSwitchTarget } from '../../lib/workflows/surfaces'
import { copyToClipboard } from '../../lib/utils'
import { useDraftPersistence } from '../../hooks/use-draft-persistence'
import { useCompareCache } from '../../hooks/use-compare-cache'
import { useDraftOverlay } from '../../hooks/use-draft-overlay'
import { useOutsideChanges } from '../../hooks/use-outside-changes'
import { useReviewActions } from '../../hooks/use-review-actions'
import { useReviewCommands } from '../../hooks/use-review-commands'
import { runShortcut } from '../../lib/ide/key-ownership'
import { useIdeShortcuts } from '../../hooks/use-ide-shortcuts'
import { useMinWidth } from '../../hooks/use-min-width'
import { useProjectFiles } from '../../hooks/use-project-files'
import { useWorkspaceProblems } from '../../hooks/use-workspace-problems'
import { useSearchActions } from '../../hooks/use-search-actions'
import { useSwitchView } from '../../hooks/use-switch-view'
import { useOrgReady } from '../../stores/org-store'
import { useIdeSearchStore } from '../../stores/ide-search-store'
import { useIdeLayoutStore, type IdeLayoutKey } from '../../stores/ide-layout-store'
import { useIdeExplorerStore } from '../../stores/ide-explorer-store'
import { useIdeStore } from '../../stores/ide-store'
import { useQuickTestStore } from '../../stores/quick-test-store'
import { clearWorkflowHistory, useWorkflowStore } from '../../stores/workflow-store'
import { ConfirmDialog } from '../ui/confirm-dialog'
import { UnsavedChangesDialog } from '../workflows/unsaved-changes-dialog'
import { BottomDock } from './bottom-dock'
import { CloseDirtyDialog } from './close-dirty-dialog'
import { useWorkspaceSession } from '../../hooks/use-workspace-session'
import { formatClock } from '../../lib/ide/session-log'
import { RunConfirmDialog } from './run-confirm-dialog'
import { CommandPalette } from './command-palette'
import { EditorGroup } from './editor-group'
import { FileExplorer } from './file-explorer'
import { FilePathDialog } from './file-path-dialog'
import { IdeHeader } from './ide-header'
import { IdeSkeleton } from './ide-skeleton'
import { NarrowWindowNotice } from './narrow-window-notice'
import { QuickOpenDialog } from './quick-open-dialog'
import { SideBar } from './side-bar'
import { SearchRunner } from './search-runner'
import { SideBarTabs } from './side-bar-tabs'
import { StatusBar } from './status-bar'
import {
  describeConversion,
  LoadFailure,
  NoVersionNotice,
  UnsavedWorkflowNotice,
} from './workspace-notices'

interface IdeWorkspaceProps {
  workflowId: string
  versionParam?: string
  fileParam?: string
}

// React Flow and every node component would otherwise load on each visit to
// the code workspace, preview open or not.
const LazyCanvasPreview = lazy(() =>
  import('./canvas-preview').then((m) => ({ default: m.CanvasPreview })),
)

const EMPTY_FILES: ReadonlyMap<string, SourceFile> = new Map()

/** Both side panels open keeps the original key, so saved sizes from before still apply. */
function workspaceLayoutKeyFor(explorerOpen: boolean, previewOpen: boolean): string {
  if (explorerOpen && previewOpen) return 'workspace'
  return `workspace:${explorerOpen ? 'explorer' : 'main'}${previewOpen ? '+preview' : ''}`
}

const NO_SHORTCUTS = {}

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

function Workspace({ workflowId, versionParam, fileParam }: IdeWorkspaceProps) {
  const ready = useOrgReady()
  const switchView = useSwitchView(workflowId)

  const fullQuery = useQuery({
    ...queries.workflows.full(workflowId, versionParam),
    enabled: ready,
  })
  const sourceQuery = useQuery({
    ...queries.workflows.source(workflowId, versionParam),
    enabled: ready,
  })
  const fullData = fullQuery.data
  const source = sourceQuery.data
  const { isReadOnly: isHistorical, readOnlyVersion } = deriveReadOnlyState(
    versionParam,
    fullData?.workflow.currentVersionId,
    fullData?.versions,
  )
  const storedHashes = useMemo(
    () =>
      Object.fromEntries(
        (source?.files ?? []).flatMap((f) => (f.hash !== undefined ? [[f.path, f.hash]] : [])),
      ),
    [source],
  )

  const {
    activePath,
    reviewPath,
    drafts,
    dialog,
    dialogTarget,
    openFile,
    closeFiles,
    requestClose,
    cycleFile,
    pruneFiles,
    setDraft,
    clearDraft,
    reconcileDrafts,
    showDialog,
    closeDialog,
  } = useIdeStore(
    useShallow((s) => ({
      activePath: s.activePath,
      reviewPath: s.reviewPath,
      drafts: s.drafts,
      dialog: s.dialog,
      dialogTarget: s.dialogTarget,
      openFile: s.openFile,
      closeFiles: s.closeFiles,
      requestClose: s.requestClose,
      cycleFile: s.cycleFile,
      pruneFiles: s.pruneFiles,
      setDraft: s.setDraft,
      clearDraft: s.clearDraft,
      reconcileDrafts: s.reconcileDrafts,
      showDialog: s.showDialog,
      closeDialog: s.closeDialog,
    })),
  )
  const {
    explorerOpen,
    dockOpen,
    previewOpen,
    toggleExplorer,
    toggleDock,
    togglePreview,
    showDock,
    setLayout,
  } = useIdeLayoutStore(
    useShallow((s) => ({
      explorerOpen: s.explorerOpen,
      dockOpen: s.dockOpen,
      previewOpen: s.previewOpen,
      toggleExplorer: s.toggleExplorer,
      toggleDock: s.toggleDock,
      togglePreview: s.togglePreview,
      showDock: s.showDock,
      setLayout: s.setLayout,
    })),
  )
  // Panel groups read their default layout once at mount; later drags flow
  // back through setLayout, so subscribing would only cause re-renders.
  const [initialLayouts] = useState(() => useIdeLayoutStore.getState().layouts)
  const workspaceLayoutKey = workspaceLayoutKeyFor(explorerOpen, previewOpen)

  const workspace = useMemo(
    () => (source ? workspaceEditability({ historical: isHistorical }) : null),
    [source, isHistorical],
  )
  const canEdit = workspace !== null && !workspace.readOnly

  // Everything about ownership comes from the one source response: a file
  // with a hash is project-owned (the hash is its write precondition), the
  // rest is generated. Legacy settings surface as virtual files to adopt.
  const storedPaths = useMemo(
    () => new Set((source?.files ?? []).filter((f) => f.hash !== undefined).map((f) => f.path)),
    [source],
  )
  const seeds = useMemo(
    () => (canEdit && fullData ? virtualSeedFiles(fullData.workflow, storedPaths) : []),
    [canEdit, fullData, storedPaths],
  )
  const savedProjectPaths = useMemo(
    () => new Set([...storedPaths, ...seeds.map((f) => f.path)]),
    [storedPaths, seeds],
  )
  const virtualPaths = useMemo(() => new Set(seeds.map((f) => f.path)), [seeds])

  const baseline = useMemo(() => {
    if (!source) return EMPTY_FILES
    const map = new Map<string, SourceFile>(source.files.map((file) => [file.path, file]))
    for (const seed of seeds) if (!map.has(seed.path)) map.set(seed.path, seed)
    return map
  }, [source, seeds])
  const draftUndo = useMemo(
    () =>
      createDraftUndo({
        getStore: useIdeStore.getState,
        notify: actionToast,
      }),
    [],
  )
  const { files, projectPaths, ghostPaths } = useDraftOverlay(baseline, drafts, savedProjectPaths)
  // Stored files only (a virtual seed is not counted by the server); it
  // changes when files do, not with every keystroke.
  const usage = useMemo(
    () =>
      projectUsage(
        [...baseline.values()].filter((f) => f.hash !== undefined && !virtualPaths.has(f.path)),
      ),
    [baseline, virtualPaths],
  )
  const dirty = useMemo(() => new Set(dirtyPaths(baseline, drafts)), [baseline, drafts])
  // Trees only depend on which files exist, so a keystroke never rebuilds them.
  const trees = useMemo(() => {
    const split = splitWorkspaceFiles(baseline.values(), projectPaths)
    return { project: buildFileTree(split.project), generated: buildFileTree(split.generated) }
  }, [baseline, projectPaths])

  // Notices files another writer changed (a teammate, an agent) while this is open.
  useOutsideChanges({ workflowId, enabled: source !== undefined && !isHistorical, baseline })

  useDraftPersistence({
    workflowId,
    enabled: canEdit,
    baseline: source ? baseline : null,
  })

  const searchActions = useSearchActions(files)
  const projectFiles = useProjectFiles({
    workflowId,
    target: fullData?.workflow.kind === 'script' ? 'script' : 'workflow',
    baseline,
    projectPaths,
    onShowImporters: searchActions.showImporters,
  })

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
  const loadError = fullQuery.error ?? (fullData?.version ? sourceQuery.error : null)
  useEffect(() => {
    if (loadError) {
      actionToast.error(failureLine(loadError, 'Couldn’t load the workflow source'))
    }
  }, [loadError])

  const hasUnsaved = dirty.size > 0

  // One problem list for the dock and the status bar: server findings first,
  // since they explain the editor markers after them.
  const markers = useWorkspaceProblems(workflowId)
  const savedProblems = useMemo(() => diagnosticProblems(source?.diagnostics ?? []), [source])
  const problemGroups = useMemo(
    () => groupProblems(markers, savedProblems, dirty),
    [markers, savedProblems, dirty],
  )
  // The status bar counts both groups, as the dock does.
  const problemCounts = countBySeverity([...savedProblems, ...markers])
  const savedAt = sourceQuery.dataUpdatedAt
    ? formatClock(new Date(sourceQuery.dataUpdatedAt).toISOString())
    : null
  const wideEnough = useMinWidth(MIN_WORKSPACE_WIDTH)
  const router = useRouter()
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

  const {
    testSession,
    runAction,
    status,
    commands,
    actions: sessionActions,
  } = useWorkspaceSession({
    workflowId,
    currentVersionId: fullData?.workflow.currentVersionId ?? null,
    historical: isHistorical,
    storedHashes,
    activeFile,
    onSaveAll: projectFiles.saveAll,
  })

  const activeIsStoredFile = activePath !== null && storedPaths.has(activePath)
  const activeIsHandlersFile = activePath === PROJECT_HANDLERS_PATH
  // What the conversion will do, shown before it is confirmed.
  const conversionPreview = useQuery({
    ...queries.workflows.handlerConversion(workflowId),
    enabled: dialog === 'convertHandlers',
  })
  const readOnlyMessage = workspace?.message ?? null

  // Text equal to the baseline is not a draft: keeping it would let a stale
  // "edit" survive an agent's later change and overwrite it on save.
  function handleEditorChange(path: string, text: string) {
    if (baseline.get(path)?.source === text) clearDraft(path)
    else setDraft(path, text, baseline.get(path)?.hash ?? null)
  }

  const review = useReviewActions({
    workflowId,
    files,
    baseline,
    canEdit,
    projectFiles,
    draftUndo,
    editabilityOf,
    onChange: handleEditorChange,
  })

  const {
    activeDirty,
    activeMovedOnServer,
    commands: reviewCommands,
  } = useReviewCommands({
    baseline,
    activePath,
    reviewPath,
    drafts,
    dirty,
    canEdit,
    readOnlyMessage,
    projectFiles,
    draftUndo,
    onCompare: review.onCompare,
  })

  const actions = useMemo<IdeCommandActions>(
    () => ({
      ...reviewCommands,
      saveAll: () => {
        if (canEdit) void projectFiles.saveAll()
      },
      discardChanges: draftUndo.discardAll,
      newFile: () => {
        if (!canEdit) return
        // The name row lives in the Explorer: show that view first, whether
        // the side bar is hidden or showing Search.
        useIdeLayoutStore.getState().showSideBar('explorer')
        useIdeExplorerStore.getState().beginCreate()
      },
      renameFile: () => {
        const path = useIdeStore.getState().activePath
        if (path && storedPaths.has(path)) showDialog('renameFile', path)
      },
      deleteFile: () => {
        const path = useIdeStore.getState().activePath
        if (path && storedPaths.has(path)) showDialog('deleteFile', path)
      },
      convertHandlers: () => {
        if (!canEdit) return
        // The server converts what it has stored, so an unsaved handlers.ts
        // is saved before the plan is drawn up: the dialog then describes
        // the conversion that will actually run.
        if (!useIdeStore.getState().drafts[PROJECT_HANDLERS_PATH]) {
          showDialog('convertHandlers')
          return
        }
        void projectFiles.saveFile(PROJECT_HANDLERS_PATH).then((saved) => {
          if (saved) showDialog('convertHandlers')
        })
      },
      quickOpen: () => showDialog('quickOpen'),
      findInFiles: searchActions.findInFiles,
      nextSearchHit: searchActions.nextSearchHit,
      prevSearchHit: searchActions.prevSearchHit,
      switchToCanvas: () => void switchView('canvas', { version: versionParam }),
      closeActiveFile: () => {
        const path = useIdeStore.getState().activePath
        if (path) requestClose([path])
      },
      closeAllFiles: () => requestClose(useIdeStore.getState().openPaths),
      copyActivePath: () => {
        const path = filePathOfTab(useIdeStore.getState().activePath)
        if (!path) return
        copyToClipboard(path)
          .then(() => actionToast.success('Path copied'))
          .catch(() => actionToast.error('Couldn’t copy the path'))
      },
      toggleExplorer,
      toggleDock,
      togglePreview,
      showProblems: () => showDock('problems'),
      showTestSession: () => showDock('session'),
      showQuickTest: () => showDock('quickTest'),
      ...sessionActions,
    }),
    [
      reviewCommands,
      canEdit,
      projectFiles,
      storedPaths,
      searchActions,
      switchView,
      versionParam,
      requestClose,
      draftUndo,
      toggleExplorer,
      toggleDock,
      togglePreview,
      showDock,
      showDialog,
      sessionActions,
    ],
  )

  useIdeShortcuts(
    !wideEnough
      ? NO_SHORTCUTS
      : {
          save: actions.save,
          saveAll: actions.saveAll,
          newFile: actions.newFile,
          quickOpen: actions.quickOpen,
          commandPalette: () => showDialog('palette'),
          toggleExplorer,
          toggleDock,
          togglePreview,
          nextTab: () => cycleFile(1),
          prevTab: () => cycleFile(-1),
          closeTab: actions.closeActiveFile,
          // ⌥⏎ is Run, unless typed into a field of its own or Monaco's find widget.
          run: runShortcut(actions.run),
          findInFiles: actions.findInFiles,
          nextSearchHit: searchActions.nextSearchHitKey,
          prevSearchHit: searchActions.prevSearchHitKey,
        },
  )

  // The requested layout is the one before size constraints clipped it,
  // which is what should come back on the next mount.
  const handleLayoutChanged = (key: IdeLayoutKey) => (layout: Layout, meta: LayoutChangedMeta) => {
    if (meta.isUserInteraction) setLayout(key, meta.requestedLayout ?? layout)
  }

  function editabilityOf(path: string) {
    return fileEditability(
      fileOwner(path, projectPaths),
      workspace ?? { readOnly: true, message: null },
    )
  }

  function handleDialogOpenChange(open: boolean) {
    if (!open) closeDialog()
  }

  function handleRenameRequest(path: string) {
    showDialog('renameFile', path)
  }

  function handleDeleteRequest(path: string) {
    showDialog('deleteFile', path)
  }

  function handleConvertRequest() {
    actions.convertHandlers()
  }

  function handleConvert() {
    closeDialog()
    void projectFiles.convertHandlers().then((result) => {
      if (!result || result.deploymentConfigUpdated) return
      const facts = describeHandlerDeclarations(result.declarations)
      if (facts.length > 0) {
        // Instructions to act on: as long as a toast with an action.
        actionToast.info(`Declare in the deployment config before deploying: ${facts.join('; ')}`, {
          description: 'There is no stored deployment config yet to carry them.',
          duration: LONG_TOAST_MS,
        })
      }
    })
  }

  // A new file opens at line 1 with the caret in it; the toast comes from the action.
  async function handleCreateFile(path: string, fileSource?: string): Promise<boolean> {
    const created = await projectFiles.createFile(path, fileSource)
    if (created) useIdeStore.getState().revealLocation({ path, line: 1, column: 1 })
    return created
  }

  function handleRename(to: string) {
    const from = dialogTarget
    closeDialog()
    if (!from) return
    void projectFiles.renameFile(from, to).then((renamed) => {
      if (!renamed) return
      // The tree can only focus the renamed row while it is showing.
      useIdeLayoutStore.getState().showSideBar('explorer')
      useIdeExplorerStore.getState().requestFocus(to)
    })
  }

  function handleDelete() {
    const path = dialogTarget
    closeDialog()
    if (path) void projectFiles.deleteFile(path)
  }

  // Save, then close: a tab whose save failed stays open, dirty dot and all,
  // because closing it would drop the only copy of the edit.
  function handleCloseSave(dirtyPaths: string[], paths: string[]) {
    void Promise.all(dirtyPaths.map((path) => projectFiles.saveFile(path))).then((results) => {
      // Cancel pressed while the save ran: the saves stand, the tabs stay.
      if (useIdeStore.getState().closeRequest === null) return
      const failed = dirtyPaths.filter((_, index) => !results[index])
      if (failed.length === 0) {
        closeFiles(paths)
        return
      }
      useIdeStore.getState().cancelClose()
      const names = failed.map(basename).join(', ')
      actionToast.error(
        `Couldn’t save ${names}, so ${failed.length === 1 ? 'its tab' : 'their tabs'} stayed open.`,
        {
          description: 'Your changes are still here.',
        },
      )
    })
  }

  function handleCloseDiscard(dirtyPaths: string[], paths: string[]) {
    for (const path of dirtyPaths) clearDraft(path)
    closeFiles(paths)
  }

  function handleRevertFile(path: string) {
    draftUndo.revertFile(path)
  }

  function handleFocusEditor() {
    useIdeStore.getState().editorHandle?.focus()
  }

  // Esc from the preview hands the keyboard back to the editor.
  function handleReturnToEditor(event: React.KeyboardEvent) {
    if (event.key === 'Escape') useIdeStore.getState().editorHandle?.focus()
  }

  function handleOpenLatest() {
    void switchView('ide')
  }

  function handleOpenCanvas() {
    void switchView('canvas', { version: versionParam })
  }

  function handleReview(path?: string) {
    useIdeStore.getState().openReview(path)
  }

  // Review… in the leave dialog: stay, and look at what would be lost.
  function handleReviewFromLeave() {
    blocker.reset?.()
    useIdeStore.getState().openReview()
  }

  function handleBack() {
    router.history.back()
  }

  function handleSaveAsFile(path: string) {
    void projectFiles.saveFile(path)
  }

  function handleShowSession() {
    showDock('session')
  }

  function handleShowProblems() {
    showDock('problems')
  }

  function handleBlockerCancel() {
    blocker.reset?.()
  }

  // Leaving without saving is a decision to drop the edits: forget the stored
  // copy too, or the next visit would "restore" what the dialog said was lost.
  function handleLeave() {
    useIdeStore.getState().clearDrafts()
    blocker.proceed?.()
  }

  function handleSaveAndSwitch() {
    const pending = dirty.size
    void projectFiles.saveAll().then((saved) => {
      // Every dirty path is a real write, so a shortfall means one failed —
      // it has toasted why, and switching would hide both the error and the
      // file still holding the change.
      if (saved === pending) blocker.proceed?.()
      else blocker.reset?.()
    })
  }

  if (fullQuery.isPending) return <IdeSkeleton />
  if (!fullData) {
    return <LoadFailure workflowId={workflowId} message={fullQuery.error?.message} />
  }
  if (!fullData.version) {
    return <NoVersionNotice workflowId={workflowId} name={fullData.workflow.name} />
  }
  if (sourceQuery.isPending) return <IdeSkeleton />
  if (!source || !workspace) {
    return <LoadFailure workflowId={workflowId} message={sourceQuery.error?.message} />
  }

  const unsavedPaths = [...dirty]
  const existingPaths = [...baseline.keys()]
  const renameExisting = existingPaths.filter((p) => p !== dialogTarget)

  // Opening the canvas is a switch, not a departure: the work stays, it just
  // needs saving first to be visible over there.
  const switchTarget =
    blocker.status === 'blocked'
      ? surfaceSwitchTarget({ current: blocker.current, next: blocker.next })
      : null
  const unsavedSentence =
    dirty.size === 1 ? 'One file has unsaved changes.' : `${dirty.size} files have unsaved changes.`
  // Pinned only while actually reading an older version. Otherwise it names
  // whichever version is current right now, and the canvas would open that
  // one read-only the moment anything creates a newer one.
  const linkVersion = isHistorical ? versionParam : undefined
  // Shown in the narrow-window notice too: the blocker still guards unsaved
  // drafts there, and a blocked navigation with no dialog is a dead end.
  const unsavedDialog = (
    <UnsavedChangesDialog
      open={blocker.status === 'blocked'}
      unsaved={unsavedSentence}
      switchTarget={switchTarget}
      canSave={canEdit}
      saving={projectFiles.busy}
      onCancel={handleBlockerCancel}
      onSaveAndGo={handleSaveAndSwitch}
      onDiscardAndGo={handleLeave}
      {...(wideEnough && canEdit && { onReview: handleReviewFromLeave })}
    />
  )
  if (!wideEnough) {
    return (
      <>
        <NarrowWindowNotice onOpenCanvas={handleOpenCanvas} onBack={handleBack} />
        {unsavedDialog}
      </>
    )
  }

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-background">
      <SearchRunner files={files} projectPaths={projectPaths} />
      <IdeHeader
        workflowId={workflowId}
        workflowName={fullData.workflow.name}
        kind={fullData.workflow.kind}
        version={fullData.version.version}
        historicalVersion={isHistorical ? (readOnlyVersion ?? fullData.version.version) : undefined}
        {...(linkVersion !== undefined && { versionParam: linkVersion })}
        dirtyCount={dirty.size}
        canEdit={canEdit}
        saving={projectFiles.busy}
        onSave={actions.saveAll}
      />
      <div className="min-h-0 flex-1">
        <Group
          orientation="horizontal"
          className="h-full"
          defaultLayout={initialLayouts[workspaceLayoutKey]}
          onLayoutChanged={handleLayoutChanged(workspaceLayoutKey)}
        >
          {explorerOpen && (
            <>
              <Panel id="explorer" defaultSize="18" minSize={180} maxSize="40">
                <SideBar
                  files={files}
                  onEscape={handleFocusEditor}
                  explorer={
                    <FileExplorer
                      tabs={<SideBarTabs view="explorer" />}
                      project={trees.project}
                      generated={trees.generated}
                      dirty={dirty}
                      unsavedPaths={reviewOrder(dirty)}
                      onReview={handleReview}
                      virtual={virtualPaths}
                      canEdit={canEdit}
                      usage={usage}
                      onCreateFile={handleCreateFile}
                      onEscape={handleFocusEditor}
                      onRename={handleRenameRequest}
                      onDelete={handleDeleteRequest}
                      onConvert={handleConvertRequest}
                    />
                  }
                />
              </Panel>
              <Separator className="w-px bg-border transition-colors hover:bg-primary/50" />
            </>
          )}
          <Panel id="main" minSize="40">
            <Group
              orientation="vertical"
              className="h-full"
              defaultLayout={initialLayouts.editor}
              onLayoutChanged={handleLayoutChanged('editor')}
            >
              <Panel id="editor" minSize="30">
                <EditorGroup
                  workflowId={workflowId}
                  files={files}
                  dirty={dirty}
                  editabilityOf={editabilityOf}
                  onChange={handleEditorChange}
                  onRevertFile={handleRevertFile}
                  virtualPaths={virtualPaths}
                  historical={isHistorical}
                  onOpenLatest={handleOpenLatest}
                  onSaveAsFile={handleSaveAsFile}
                  onConvertHandlers={handleConvertRequest}
                  onOpenCanvas={handleOpenCanvas}
                  run={{
                    label: runAction.intent.label,
                    busy: runAction.intent.kind === 'busy',
                    onRun: sessionActions.run,
                  }}
                  review={review}
                />
              </Panel>
              {dockOpen && (
                <>
                  <Separator className="h-px bg-border transition-colors hover:bg-primary/50" />
                  <Panel id="dock" defaultSize="28" minSize={120} maxSize="70">
                    <BottomDock
                      workflowId={workflowId}
                      groups={problemGroups}
                      savedAt={savedAt}
                      testSession={testSession}
                      activeFile={activeFile}
                      onSaveAll={projectFiles.saveAll}
                      onTrigger={sessionActions.triggerSession}
                    />
                  </Panel>
                </>
              )}
            </Group>
          </Panel>
          {previewOpen && (
            <>
              <Separator className="w-px bg-border transition-colors hover:bg-primary/50" />
              <Panel id="preview" defaultSize="28" minSize={240} maxSize="50">
                <div className="flex h-full flex-col bg-card" onKeyDown={handleReturnToEditor}>
                  <Suspense fallback={null}>
                    <LazyCanvasPreview
                      workflowId={workflowId}
                      {...(linkVersion !== undefined && { versionParam: linkVersion })}
                    />
                  </Suspense>
                </div>
              </Panel>
            </>
          )}
        </Group>
      </div>
      <StatusBar
        version={
          isHistorical ? (readOnlyVersion ?? fullData.version.version) : fullData.version.version
        }
        historical={isHistorical}
        session={status}
        errors={problemCounts.error}
        warnings={problemCounts.warning}
        unsaved={unsavedPaths}
        canEdit={canEdit}
        activePath={filePathOfTab(activePath)}
        readOnly={filePathOfTab(activePath) !== null && editabilityOf(activePath!).readOnly}
        onOpenLatest={handleOpenLatest}
        onShowSession={handleShowSession}
        onShowProblems={handleShowProblems}
        onReview={handleReview}
      />
      <CommandPalette
        actions={actions}
        canEdit={canEdit}
        activeIsStoredFile={activeIsStoredFile}
        activeIsHandlersFile={activeIsHandlersFile}
        activeDirty={activeDirty}
        activeMovedOnServer={activeMovedOnServer}
        dirtyCount={dirty.size}
        runLabel={runAction.intent.label}
        runEnabled={runAction.intent.kind !== 'busy'}
        canStartSession={commands.canStart}
        canStopSession={commands.canStop}
        canTriggerSession={commands.canTrigger}
      />
      <RunConfirmDialog confirm={runAction.confirm} />
      <QuickOpenDialog files={baseline} />
      <FilePathDialog
        key={`rename:${dialogTarget ?? ''}:${dialog === 'renameFile'}`}
        open={dialog === 'renameFile'}
        title="Rename file"
        description="Imports of the old path aren’t updated."
        submitLabel="Rename"
        initialPath={dialogTarget ?? ''}
        existingPaths={renameExisting}
        busy={projectFiles.busy}
        onOpenChange={handleDialogOpenChange}
        onSubmit={handleRename}
      />
      <ConfirmDialog
        open={dialog === 'deleteFile'}
        onOpenChange={handleDialogOpenChange}
        title={`Delete ${dialogTarget ? basename(dialogTarget) : 'file'}?`}
        description={`Deletes ${dialogTarget ?? 'the file'}. Anything that imports it won’t build until you update it.`}
        confirmLabel="Delete"
        loading={projectFiles.busy}
        onConfirm={handleDelete}
      />
      <ConfirmDialog
        open={dialog === 'convertHandlers'}
        onOpenChange={handleDialogOpenChange}
        title="Convert to handler modules?"
        description={describeConversion(conversionPreview.data, conversionPreview.error)}
        confirmLabel="Convert"
        variant="warning"
        loading={projectFiles.busy || conversionPreview.isPending}
        onConfirm={handleConvert}
      />
      <CloseDirtyDialog
        saving={projectFiles.busy}
        onSave={handleCloseSave}
        onDiscard={handleCloseDiscard}
        onReview={handleReview}
      />
      {unsavedDialog}
    </div>
  )
}
