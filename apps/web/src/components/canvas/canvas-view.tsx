import { useBlocker } from '@tanstack/react-router'
import { lazy, Suspense, useState, useEffect } from 'react'
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
import { api } from '../../lib/api-client'
import { useOrgReady } from '../../stores/org-store'
import { EditorToolbar } from './editor-toolbar'
import { EditorDialogs } from './editor-dialogs'
import { CanvasSidePanels } from './canvas-side-panels'
import { useShallow } from 'zustand/react/shallow'
import {
  buildWorkflowStoreState,
  deriveReadOnlyState,
  deriveDeploymentState,
} from '../../lib/hydrate-workflow'
import { surfaceSwitchTarget } from '../../lib/workflows/surfaces'
import { useWorkflowPersistence } from '../../hooks/use-workflow-persistence'
import { useAutoSave } from '../../hooks/use-auto-save'
import { buildIRFromState } from '../../lib/build-ir'
import { serializeArtifact } from '@awaitstep/ir'
import { downloadJsonFile } from '../../lib/download-file'

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
  localDevEnabled: boolean
}

export function CanvasView({
  workflowId,
  versionParam,
  template,
  kindParam,
  localDevEnabled,
}: CanvasViewProps) {
  const [showLocalTest, setShowLocalTest] = useState(false)
  // Functions never show the template picker — templates are workflow-shaped.
  const [showTemplatePicker, setShowTemplatePicker] = useState(!!template && kindParam !== 'script')
  const [confirmAction, setConfirmAction] = useState<'switch-template' | null>(null)

  const ready = useOrgReady()
  const { registry: nodeRegistry } = useNodeRegistry()
  const isNew = workflowId === 'new'

  const { metadata, nodeCount, showSettings, isDirty } = useWorkflowStore(
    useShallow((s) => ({
      metadata: s.metadata,
      nodeCount: s.nodes.length,
      showSettings: s.showSettings,
      isDirty: s.isDirty,
    })),
  )
  const {
    setShowSettings,
    addNode,
    reset: resetWorkflowStore,
    runSimulation,
    setWorkflowId,
  } = useWorkflowStore()

  // Cleanup on unmount
  useEffect(() => {
    return () => resetWorkflowStore()
  }, [resetWorkflowStore])

  // Navigation blocker
  const hasUnsavedChanges = isDirty || (isNew && nodeCount > 0)
  const { proceed, reset, status, current, next } = useBlocker({
    shouldBlockFn: () => hasUnsavedChanges,
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
  const { isReadOnly, readOnlyVersion } = deriveReadOnlyState(
    versionParam,
    fullData?.workflow?.currentVersionId,
    fullData?.versions,
  )
  const { hasActiveDeployment, currentVersion, deployedVersion, hasUndeployedChanges } =
    deriveDeploymentState(fullData)

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
      })
      setWorkflowId('new')
      // Loading a document is not an undoable edit — start from a clean slate
      // so ⌘Z can never rewind into another workflow's graph.
      clearWorkflowHistory()
      return
    }
    setWorkflowId(workflowId)
    if (fullData?.workflow) {
      useWorkflowStore.setState(
        buildWorkflowStoreState(fullData.workflow, fullData.version, currentVersion, isReadOnly, {
          handlerModules: fullData.handlers.modules,
        }),
      )
      clearWorkflowHistory()
    }
  }, [workflowId, isNew, kindParam, fullData, setWorkflowId, isReadOnly, currentVersion])

  // Persistence (save + deploy)
  const { handleSave, saveNow, handleDeploy, saveSilent, isSaving, lastSavedAt, saveError } =
    useWorkflowPersistence({
      workflowId,
      isNew,
      isDirty,
      nodeRegistry,
      kind: kindParam,
    })

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
      e.preventDefault()
      if (isReadOnly || isSaving) return
      handleSave()
    }
    window.addEventListener('keydown', handleSaveShortcut)
    return () => window.removeEventListener('keydown', handleSaveShortcut)
  }, [handleSave, isReadOnly, isSaving])

  // Auto-save 30s after the last meaningful change. Skipped on read-only
  // workflows and on never-saved workflows (so a stray drag on /new doesn't
  // create a phantom workflow).
  useAutoSave({
    enabled: !isReadOnly && !isNew,
    save: saveSilent,
  })

  const handleAddNode = (type: Parameters<typeof addNode>[0]) => {
    addNode(type, { x: 250 + Math.random() * 200, y: 150 + Math.random() * 200 }, nodeRegistry)
  }

  function handleExport() {
    const state = useWorkflowStore.getState()
    const ir = buildIRFromState(state)
    const json = serializeArtifact(ir)
    const filename = `${metadata.name.replace(/\s+/g, '-').toLowerCase()}.ir.json`
    downloadJsonFile(filename, json)
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
                showSettings={showSettings}
                onToggleSettings={() => setShowSettings(!showSettings)}
                onSave={handleSave}
                isSaving={isSaving}
                lastSavedAt={lastSavedAt}
                saveError={saveError}
                onDeploy={handleDeploy}
                onTest={() => runSimulation()}
                onTestLocally={localDevEnabled ? () => setShowLocalTest((v) => !v) : undefined}
                onExport={nodeCount > 0 ? handleExport : undefined}
                onOpenTemplatePicker={() => {
                  if (nodeCount > 0) {
                    setConfirmAction('switch-template')
                  } else {
                    setShowTemplatePicker(true)
                  }
                }}
                readOnly={isReadOnly}
                readOnlyVersion={readOnlyVersion}
                versionParam={versionParam}
              />
              <div className="relative flex-1 overflow-hidden">
                <LazyCanvas />
                {!isReadOnly && (
                  <div className="absolute left-4 top-4 z-10">
                    <NodePalette onAddNode={handleAddNode} />
                  </div>
                )}
                {isNew && showTemplatePicker && (
                  <TemplatePicker onDismiss={() => setShowTemplatePicker(false)} />
                )}
                <BindingsPanel />
                <SimulationPanel />
                <ValidationPanel />
                <CanvasSidePanels
                  showLocalTest={showLocalTest && !isNew}
                  onCloseLocalTest={() => setShowLocalTest(false)}
                  workflowId={workflowId}
                />
              </div>
            </div>
            <EditorDialogs
              confirmAction={confirmAction}
              setConfirmAction={setConfirmAction}
              onConfirmSwitchTemplate={() => setShowTemplatePicker(true)}
              blockerStatus={status}
              onBlockerProceed={proceed}
              onBlockerReset={reset}
              switchTarget={switchTarget}
              canSave={!isReadOnly}
              onSaveAndSwitch={handleSaveAndSwitch}
              isSaving={isSaving}
            />
          </LazyReactFlowProvider>
        </LoadingView>
      </Suspense>
    </ClientOnly>
  )
}
