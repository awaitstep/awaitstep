import { useBlocker, useLocation, useNavigate } from '@tanstack/react-router'
import { lazy, Suspense, useRef, useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { actionToast } from '../../lib/action-toast'
import { NodePalette } from './node-palette'
import { TemplatePicker } from './template-picker'
import { ClientOnly } from './client-only'
import { CanvasSkeleton } from './canvas-skeleton'
import { LoadingView } from '../ui/loading-view'
import { clearWorkflowHistory, useWorkflowStore } from '../../stores/workflow-store'
import { SimulationPanel } from './simulation-panel'
import { ValidationPanel } from './validation-panel'
import { BindingsPanel } from './bindings-panel'
import { useNodeRegistry } from '../../contexts/node-registry-context'
import { EditorToolbar } from './editor-toolbar'
import { EditorDialogs, type CanvasConfirmAction } from './editor-dialogs'
import { CanvasSidePanels } from './canvas-side-panels'
import { useShallow } from 'zustand/react/shallow'
import { useCanvasLayoutStore } from '../../stores/canvas-layout-store'
import { useLocalTestStore } from '../../stores/local-test-store'
import {
  buildWorkflowStoreState,
  nodeToSelectOnce,
  deriveReadOnlyState,
  deriveDeploymentState,
} from '../../lib/hydrate-workflow'
import { surfaceSwitchTarget } from '../../lib/workflows/surfaces'
import { isOverlayToggle, withOverlay } from '../../lib/dashboard-paths'
import { MarketplaceDialog } from '../resources/marketplace-dialog'
import { offersTemplates } from '../../lib/workflows/template-offer'
import { useWorkflowPersistence } from '../../hooks/use-workflow-persistence'
import { useAutoSave } from '../../hooks/use-auto-save'
import { exportWorkflowFile } from '../../lib/export-workflow'
import { useApi, useApiReady } from '../../contexts/api-client-context'
import { useEditorAccess, useItemSlugs } from '../../contexts/editor-scope-context'

const LazyReactFlowProvider = lazy(() =>
  import('@xyflow/react').then((m) => ({ default: m.ReactFlowProvider })),
)

const LazyCanvas = lazy(() =>
  import('./workflow-canvas').then((m) => ({ default: m.WorkflowCanvas })),
)

interface CanvasViewProps {
  workflowId: string
  versionParam?: string
  template?: boolean
  kindParam?: 'workflow' | 'script'
  /** The editor URL's `?node=`: opens with this node selected and centred, if the version has it. */
  nodeParam?: string
  /** The editor URL's `?open=marketplace`: the marketplace over the graph. */
  marketplaceOpen: boolean
  localDevEnabled: boolean
}

export function CanvasView({
  workflowId,
  versionParam,
  template,
  kindParam,
  nodeParam,
  marketplaceOpen,
  localDevEnabled,
}: CanvasViewProps) {
  const api = useApi()
  const localTestOpen = useLocalTestStore((s) => s.open && s.workflowId === workflowId)
  // Functions never show the template picker — templates are workflow-shaped.
  const [showTemplatePicker, setShowTemplatePicker] = useState(!!template && kindParam !== 'script')
  const [confirmAction, setConfirmAction] = useState<CanvasConfirmAction | null>(null)

  const ready = useApiReady()
  const { registry: nodeRegistry } = useNodeRegistry()
  const isNew = workflowId === 'new'

  const { metadata, nodeCount, isDirty } = useWorkflowStore(
    useShallow((s) => ({
      metadata: s.metadata,
      nodeCount: s.nodes.length,
      isDirty: s.isDirty,
    })),
  )
  const { addNode, reset: resetWorkflowStore, runSimulation, setWorkflowId } = useWorkflowStore()

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      resetWorkflowStore()
      useCanvasLayoutStore.getState().closePalette()
      // A preview belongs to the graph it was opened on, not the next one.
      useCanvasLayoutStore.getState().setCodePreviewOpen(false)
    }
  }, [resetWorkflowStore])

  // Navigation blocker
  const hasUnsavedChanges = isDirty || (isNew && nodeCount > 0)
  const { proceed, reset, status, current, next } = useBlocker({
    // Opening the marketplace overlay stays on this graph; only a real
    // departure (or a view switch) asks about unsaved work.
    shouldBlockFn: ({ current: from, next: to }) => hasUnsavedChanges && !isOverlayToggle(from, to),
    enableBeforeUnload: () => hasUnsavedChanges,
    withResolver: true,
  })

  // Fetch workflow data
  const {
    data: fullData,
    isLoading: isLoadingWorkflow,
    error: workflowError,
  } = useQuery({
    queryKey: ['workflow-full', workflowId, versionParam],
    queryFn: () => api.getWorkflowFull(workflowId, versionParam),
    enabled: ready && !isNew,
    retry: false,
  })

  useEffect(() => {
    if (workflowError) actionToast.error('Failed to load workflow')
  }, [workflowError])

  // Derive state from query data
  const { isReadOnly: isOlderVersion, readOnlyVersion } = deriveReadOnlyState(
    versionParam,
    fullData?.workflow?.currentVersionId,
    fullData?.versions,
  )
  // A Viewer sees the latest version as it is, with nothing to change or save.
  const access = useEditorAccess()
  const slugs = useItemSlugs()
  const location = useLocation()
  const navigate = useNavigate()
  const isReadOnly = isOlderVersion || !access.canEdit
  const { hasActiveDeployment, currentVersion, deployedVersion, hasUndeployedChanges } =
    deriveDeploymentState(fullData)
  const canPickTemplate = offersTemplates({ isNew, kindParam, fullData })

  // The URL's node is applied by the first hydration that has the graph, not
  // by every refetch after it, so saving never re-selects what was deselected.
  const appliedNodeParam = useRef<string | undefined>(undefined)

  // Hydrate store from server data
  useEffect(() => {
    if (isNew) {
      useWorkflowStore.setState({
        kind: kindParam ?? 'workflow',
        workflowEnvVars: [],
        dependencies: {},
        triggerCode: '',
        validationResult: null,
        simulationResult: null,
        isDirty: false,
        readOnly: false,
        graphHash: null,
      })
      setWorkflowId('new')
      // Loading a document is not an undoable edit — start from a clean slate
      // so ⌘Z can never rewind into another workflow's graph.
      clearWorkflowHistory()
      return
    }
    setWorkflowId(workflowId)
    if (fullData?.workflow) {
      const selectNodeId = nodeToSelectOnce(nodeParam, appliedNodeParam.current)
      appliedNodeParam.current = nodeParam
      useWorkflowStore.setState(
        buildWorkflowStoreState(fullData.workflow, fullData.version, currentVersion, isReadOnly, {
          handlerModules: fullData.handlers.modules,
          selectNodeId,
          keepSelectedNodeId: useWorkflowStore.getState().selectedNodeId,
          graphHash: fullData.graphHash,
        }),
      )
      clearWorkflowHistory()
      // A step the URL names is there to be looked at: its inspector opens
      // even if it was hidden.
      if (selectNodeId && useWorkflowStore.getState().selectedNodeId === selectNodeId) {
        useCanvasLayoutStore.getState().setInspectorOpen(true)
      }
    }
    // Keyed on the version, not on `isReadOnly`: a role change mid-session must
    // not rebuild the store and drop unsaved edits (the API refuses the save).
  }, [
    workflowId,
    isNew,
    kindParam,
    nodeParam,
    fullData,
    setWorkflowId,
    isOlderVersion,
    currentVersion,
  ])

  // Persistence (save + deploy)
  const {
    handleSave,
    saveNow,
    handleDeploy,
    saveSilent,
    isSaving,
    lastSavedAt,
    saveError,
    saveConflict,
    reload,
    reloading,
  } = useWorkflowPersistence({
    workflowId,
    isNew,
    isDirty,
    hasVersion: !!fullData?.workflow?.currentVersionId,
    nodeRegistry,
    kind: kindParam,
  })

  // Code saved this workflow under the canvas: the way on is to load what is
  // saved now. Unsaved canvas edits go with it, so they are asked about first.
  function handleReload() {
    if (isDirty) setConfirmAction('reload')
    else void reload()
  }

  function handleConfirmReload() {
    void reload()
  }

  // Switching to the Code view is a switch, not a departure, and it is the
  // one blocked navigation worth offering to save for.
  const switchTarget = status === 'blocked' ? surfaceSwitchTarget({ current, next }) : null

  function handleSaveAndSwitch() {
    void saveNow().then((saved) => {
      // `proceed()` resumes the navigation that was already blocked, which
      // is the only option that does not re-run shouldBlockFn — that still
      // closes over the pre-save isDirty, so a fresh navigate() here would
      // simply be blocked again. The switch's own search (no ?version= on an
      // editable canvas) is what keeps this landing on the version the save
      // just created.
      if (saved) proceed?.()
      // A refused save puts its reasons in the validation panel and on the
      // node badges — both behind this dialog, so close it and stay.
      else reset?.()
    })
  }

  // ⌘↵ saves from anywhere on the canvas, including while typing in a
  // config field (the only shortcut that deliberately fires in inputs).
  useEffect(() => {
    function handleSaveShortcut(e: KeyboardEvent) {
      if (e.key !== 'Enter' || !(e.metaKey || e.ctrlKey)) return
      // A dialog above the canvas keeps its own keys: ⌘↵ in it is not "save the canvas".
      if ((e.target as HTMLElement | null)?.closest?.('[role="dialog"]')) return
      e.preventDefault()
      if (isReadOnly || isSaving || saveConflict) return
      handleSave()
    }
    window.addEventListener('keydown', handleSaveShortcut)
    return () => window.removeEventListener('keydown', handleSaveShortcut)
  }, [handleSave, isReadOnly, isSaving, saveConflict])

  // Auto-save 30s after the last meaningful change. Skipped on read-only
  // workflows, on never-saved workflows (so a stray drag on /new doesn't
  // create a phantom workflow) and once Code has moved the workflow (every
  // save would be refused until Reload).
  useAutoSave({
    enabled: !isReadOnly && !isNew && !saveConflict,
    save: saveSilent,
  })

  const handleAddNode = (type: Parameters<typeof addNode>[0]) => {
    addNode(type, { x: 250 + Math.random() * 200, y: 150 + Math.random() * 200 }, nodeRegistry)
  }

  function handleOpenLocalTest() {
    // Both live in the right-hand slot: testing the graph wins over reading it.
    useCanvasLayoutStore.getState().setCodePreviewOpen(false)
    useLocalTestStore.getState().openFor(workflowId, 'canvas')
  }

  // The result opens in the bottom panel, which the canvas already hosts.
  function handleCheck() {
    runSimulation()
  }

  function handleOpenTemplatePicker() {
    if (nodeCount > 0) setConfirmAction('switch-template')
    else setShowTemplatePicker(true)
  }

  // The marketplace is a routed overlay, so the URL says it is open and the
  // canvas (and its unsaved graph) stays mounted underneath.
  function handleBrowseMarketplace() {
    void navigate({ href: withOverlay(location.href, 'marketplace'), replace: true })
  }

  function handleCloseMarketplace() {
    void navigate({ href: withOverlay(location.href, null), replace: true })
  }

  // Show skeleton while waiting for workflow data (skip for new workflows)
  const showSkeleton = !isNew && !workflowError && (isLoadingWorkflow || !fullData)

  return (
    <ClientOnly fallback={<CanvasSkeleton />}>
      <Suspense fallback={<CanvasSkeleton />}>
        <LoadingView isLoading={showSkeleton} LoadingPlaceholder={CanvasSkeleton}>
          <LazyReactFlowProvider>
            <div className="fixed inset-0 flex flex-col overflow-hidden bg-background">
              <EditorToolbar
                workflowId={workflowId}
                isNew={isNew}
                workflowName={metadata.name}
                kind={isNew ? kindParam : fullData?.workflow?.kind}
                currentVersion={currentVersion}
                nodeCount={nodeCount}
                isDirty={isDirty}
                hasActiveDeployment={hasActiveDeployment}
                hasUndeployedChanges={hasUndeployedChanges}
                deployedVersion={deployedVersion?.version}
                onSave={handleSave}
                isSaving={isSaving}
                lastSavedAt={lastSavedAt}
                saveError={saveError}
                saveConflict={saveConflict}
                onReload={handleReload}
                reloading={reloading}
                onDeploy={handleDeploy}
                onCheck={handleCheck}
                onTestLocally={localDevEnabled ? handleOpenLocalTest : undefined}
                onExport={nodeCount > 0 ? exportWorkflowFile : undefined}
                onOpenTemplatePicker={canPickTemplate ? handleOpenTemplatePicker : undefined}
                readOnly={isReadOnly}
                olderVersion={isOlderVersion}
                readOnlyVersion={readOnlyVersion}
                viewOnlyReason={access.reason ?? undefined}
                versionParam={versionParam}
              />
              <div className="relative flex-1 overflow-hidden">
                <LazyCanvas
                  focusNodeId={nodeParam}
                  workflowId={isNew ? null : workflowId}
                  versionParam={versionParam}
                />
                {!isReadOnly && (
                  <div className="absolute left-4 top-4 z-10">
                    <NodePalette
                      onAddNode={handleAddNode}
                      onBrowseMarketplace={handleBrowseMarketplace}
                    />
                  </div>
                )}
                {canPickTemplate && !isReadOnly && showTemplatePicker && (
                  <TemplatePicker onDismiss={() => setShowTemplatePicker(false)} />
                )}
                <BindingsPanel />
                <SimulationPanel />
                <ValidationPanel />
                <CanvasSidePanels
                  showLocalTest={localTestOpen && !isNew}
                  onCloseLocalTest={() => useLocalTestStore.getState().requestClose()}
                  workflowId={workflowId}
                />
              </div>
            </div>
            <EditorDialogs
              confirmAction={confirmAction}
              setConfirmAction={setConfirmAction}
              onConfirmSwitchTemplate={() => setShowTemplatePicker(true)}
              onConfirmReload={handleConfirmReload}
              blockerStatus={status}
              onBlockerProceed={proceed}
              onBlockerReset={reset}
              switchTarget={switchTarget}
              canSave={!isReadOnly}
              saveConflict={saveConflict}
              onSaveAndSwitch={handleSaveAndSwitch}
              isSaving={isSaving}
            />
            {marketplaceOpen && (
              <MarketplaceDialog org={slugs.org} onClose={handleCloseMarketplace} />
            )}
          </LazyReactFlowProvider>
        </LoadingView>
      </Suspense>
    </ClientOnly>
  )
}
