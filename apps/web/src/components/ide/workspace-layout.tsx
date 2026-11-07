import { lazy, Suspense, useMemo, type ReactNode } from 'react'
import { Group, Panel, Separator } from 'react-resizable-panels'
import type { Layout, LayoutChangedMeta } from 'react-resizable-panels'
import { useShallow } from 'zustand/react/shallow'
import { PROJECT_HANDLERS_PATH } from '@awaitstep/ir'
import type { WorkflowFull, WorkflowSource } from '../../lib/api-client'
import { reviewOrder } from '../../lib/ide/review'
import { deriveDeploymentState } from '../../lib/hydrate-workflow'
import { filePathOfTab } from '../../lib/ide/tabs'
import type { useWorkspaceActions } from '../../hooks/use-workspace-actions'
import type { WorkspaceData } from '../../hooks/use-workspace-data'
import { HANDLER_SCHEDULED_PATH } from '@awaitstep/ir'
import { scheduleMissing } from '../../lib/ide/schedule-gap'
import type { ProjectFilesController } from '../../hooks/use-project-files'
import type { useWorkspaceSession } from '../../hooks/use-workspace-session'
import { useEditorAccess } from '../../contexts/editor-scope-context'
import { useIdeLayoutStore, type IdeLayoutKey } from '../../stores/ide-layout-store'
import { useIdeStore } from '../../stores/ide-store'
import { useWorkflowStore } from '../../stores/workflow-store'
import { BottomDock } from './bottom-dock'
import { CommandPalette } from './command-palette'
import { EditorGroup } from './editor-group'
import { FileExplorer } from './file-explorer'
import { IdeHeader } from './ide-header'
import { QuickOpenDialog } from './quick-open-dialog'
import { RunConfirmDialog } from './run-confirm-dialog'
import { SearchRunner } from './search-runner'
import { SideBar } from './side-bar'
import { SideBarTabs } from './side-bar-tabs'
import { StatusBar } from './status-bar'
import { StepsView } from './steps-view'
import { StepSyncProvider } from './step-sync-context'

// React Flow and every node component would otherwise load on each visit to
// the code workspace, preview open or not.
const LazyCanvasPreview = lazy(() =>
  import('./canvas-preview').then((m) => ({ default: m.CanvasPreview })),
)

/** Both side panels open keeps the original key, so saved sizes from before still apply. */
function workspaceLayoutKeyFor(explorerOpen: boolean, previewOpen: boolean): string {
  if (explorerOpen && previewOpen) return 'workspace'
  return `workspace:${explorerOpen ? 'explorer' : 'main'}${previewOpen ? '+preview' : ''}`
}

interface WorkspaceLayoutProps {
  workflowId: string
  fullData: WorkflowFull
  /** The version being shown; null for a workflow nobody has saved on the canvas yet. */
  version: WorkflowFull['version']
  source: WorkflowSource
  data: WorkspaceData
  session: ReturnType<typeof useWorkspaceSession>
  handlers: ReturnType<typeof useWorkspaceActions>
  projectFiles: ProjectFilesController
  /** The open file with unsaved edits applied. */
  activeFile: { path: string; source: string } | null
  /** Pinned only while reading an older version. */
  linkVersion: string | undefined
  /** Panel sizes as saved when the workspace mounted; the groups read them once. */
  initialLayouts: ReturnType<typeof useIdeLayoutStore.getState>['layouts']
  /** The dialogs, rendered inside the workspace so they share its stacking and keys. */
  dialogs: ReactNode
}

/**
 * The code workspace's frame: header, the resizable explorer / editor / dock /
 * preview panes, the status bar and the palette, inside the Steps sync.
 * Panel visibility and sizes come straight from the layout store.
 */
export function WorkspaceLayout({
  workflowId,
  fullData,
  version,
  source,
  data,
  session,
  handlers,
  projectFiles,
  activeFile,
  linkVersion,
  initialLayouts,
  dialogs,
}: WorkspaceLayoutProps) {
  const access = useEditorAccess()
  const {
    isHistorical,
    readOnlyVersion,
    canEdit,
    storedPaths,
    virtualPaths,
    stepPaths,
    stepSourceByNode,
    baseline,
    files,
    projectPaths,
    usage,
    dirty,
    trees,
    problemGroups,
    problemCounts,
    savedAt,
    editabilityOf,
  } = data
  const { testSession, runAction, status, commands, actions: sessionActions } = session
  const {
    actions,
    review,
    activeDirty,
    activeMovedOnServer,
    handleEditorChange,
    handleRenameFile,
    handleDeleteRequest,
    handleDeleteFolderRequest,
    handleConvertRequest,
    handleCreateFile,
    handleRevertFile,
    handleFocusEditor,
    handleOpenLatest,
    handleOpenCanvas,
    handleReview,
    handleSaveAsFile,
    handleShowSession,
    handleShowProblems,
  } = handlers
  const activePath = useIdeStore((s) => s.activePath)
  // The step whose editable source is the active file: the palette offers
  // "New Step After Current Step" only where there is one to place it after.
  const activeStepId = useMemo(() => {
    if (activePath === null) return null
    for (const [nodeId, path] of stepSourceByNode) {
      if (path === activePath) return nodeId
    }
    return null
  }, [activePath, stepSourceByNode])
  const graphEdges = useWorkflowStore((s) => s.edges)
  const activeStepBranches = useMemo(
    () => activeStepId !== null && graphEdges.filter((e) => e.source === activeStepId).length > 1,
    [activeStepId, graphEdges],
  )
  const { explorerOpen, dockOpen, previewOpen, setLayout } = useIdeLayoutStore(
    useShallow((s) => ({
      explorerOpen: s.explorerOpen,
      dockOpen: s.dockOpen,
      previewOpen: s.previewOpen,
      setLayout: s.setLayout,
    })),
  )
  const workspaceLayoutKey = workspaceLayoutKeyFor(explorerOpen, previewOpen)
  const activeIsStoredFile = activePath !== null && storedPaths.has(activePath)
  const activeIsHandlersFile = activePath === PROJECT_HANDLERS_PATH
  const unsavedPaths = [...dirty]
  const { hasActiveDeployment, hasUndeployedChanges, deployedVersion, currentVersion } =
    deriveDeploymentState(fullData)
  const deployState = {
    hasActiveDeployment,
    hasUndeployedChanges,
    deployedVersion: deployedVersion?.version,
    currentVersion,
  }

  // The requested layout is the one before size constraints clipped it,
  // which is what should come back on the next mount.
  const handleLayoutChanged = (key: IdeLayoutKey) => (layout: Layout, meta: LayoutChangedMeta) => {
    if (meta.isUserInteraction) setLayout(key, meta.requestedLayout ?? layout)
  }

  // Esc from the preview hands the keyboard back to the editor.
  function handleReturnToEditor(event: React.KeyboardEvent) {
    if (event.key === 'Escape') useIdeStore.getState().editorHandle?.focus()
  }

  const scheduleGap = scheduleMissing({
    hasScheduledModule: files.has(HANDLER_SCHEDULED_PATH),
    deployConfig: fullData.workflow.deployConfig,
    ir: fullData.version?.ir,
  })

  const view = (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-background">
      <SearchRunner files={files} projectPaths={projectPaths} />
      <IdeHeader
        workflowId={workflowId}
        workflowName={fullData.workflow.name}
        kind={fullData.workflow.kind}
        {...(version && { version: version.version })}
        {...(version && isHistorical && { historicalVersion: readOnlyVersion ?? version.version })}
        {...(linkVersion !== undefined && { versionParam: linkVersion })}
        deployState={deployState}
        dirtyCount={dirty.size}
        canEdit={canEdit}
        {...(access.reason && { viewOnlyReason: access.reason })}
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
                  steps={
                    <StepsView
                      tabs={<SideBarTabs view="steps" />}
                      onEscape={handleFocusEditor}
                      canEdit={canEdit}
                      readOnlyMessage={data.workspace?.message ?? null}
                      onCreateStep={projectFiles.createStep}
                    />
                  }
                  explorer={
                    <FileExplorer
                      tabs={<SideBarTabs view="explorer" />}
                      project={trees.project}
                      generated={trees.generated}
                      dirty={dirty}
                      unsavedPaths={reviewOrder(dirty)}
                      onReview={handleReview}
                      virtual={virtualPaths}
                      stepPaths={stepPaths}
                      canEdit={canEdit}
                      usage={usage}
                      onCreateFile={handleCreateFile}
                      onEscape={handleFocusEditor}
                      onRenameFile={handleRenameFile}
                      onDelete={handleDeleteRequest}
                      onDeleteFolder={handleDeleteFolderRequest}
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
                  scheduleMissing={scheduleGap}
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
                      hasVersion={session.hasVersion}
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
          version ? (isHistorical ? (readOnlyVersion ?? version.version) : version.version) : null
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
        editBlockedReason={data.workspace?.message ?? null}
        activeStepId={activeStepId}
        activeStepBranches={activeStepBranches}
        activeIsStoredFile={activeIsStoredFile}
        activeIsHandlersFile={activeIsHandlersFile}
        activeDirty={activeDirty}
        activeMovedOnServer={activeMovedOnServer}
        dirtyCount={dirty.size}
        runBlockedReason={session.blockedReason}
        runLabel={runAction.intent.label}
        runEnabled={runAction.intent.kind !== 'busy'}
        canStartSession={commands.canStart}
        canStopSession={commands.canStop}
        canTriggerSession={commands.canTrigger}
      />
      <RunConfirmDialog confirm={runAction.confirm} />
      <QuickOpenDialog files={baseline} />
      {dialogs}
    </div>
  )

  return (
    <StepSyncProvider
      workflowId={workflowId}
      linkVersion={linkVersion}
      kind={fullData.workflow.kind === 'script' ? 'script' : 'workflow'}
      manifest={source.manifest ?? null}
      files={files}
      projectPaths={projectPaths}
      sourcePaths={stepSourceByNode}
      workflowFile={source.primary ?? null}
      versions={fullData.versions}
      graphVersionId={version?.id ?? null}
      codeVersionId={source.versionId ?? null}
    >
      {view}
    </StepSyncProvider>
  )
}
