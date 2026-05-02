import { createFileRoute, useParams, useSearch, useBlocker } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { lazy, Suspense, useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { NodePalette } from '../../../components/canvas/node-palette'
import { TemplatePicker } from '../../../components/canvas/template-picker'
import { ClientOnly } from '../../../components/canvas/client-only'
import { CanvasSkeleton } from '../../../components/canvas/canvas-skeleton'
import { LoadingView } from '../../../components/ui/loading-view'
import { useWorkflowStore } from '../../../stores/workflow-store'
import { SimulationPanel } from '../../../components/canvas/simulation-panel'
import { BindingsPanel } from '../../../components/canvas/bindings-panel'
import { NodeRegistryProvider, useNodeRegistry } from '../../../contexts/node-registry-context'
import { api } from '../../../lib/api-client'
import { useOrgReady } from '../../../stores/org-store'
import { EditorToolbar } from '../../../components/canvas/editor-toolbar'
import { EditorDialogs } from '../../../components/canvas/editor-dialogs'
import { CanvasSidePanels } from '../../../components/canvas/canvas-side-panels'
import { useShallow } from 'zustand/react/shallow'
import {
  buildWorkflowStoreState,
  deriveReadOnlyState,
  deriveDeploymentState,
} from '../../../lib/hydrate-workflow'
import { useWorkflowPersistence } from '../../../hooks/use-workflow-persistence'
import { buildIRFromState } from '../../../lib/build-ir'
import { serializeArtifact } from '@awaitstep/ir'
import { downloadJsonFile } from '../../../lib/download-file'

const LazyReactFlowProvider = lazy(() =>
  import('@xyflow/react').then((m) => ({ default: m.ReactFlowProvider })),
)
const LazyCanvas = lazy(() =>
  import('../../../components/canvas/workflow-canvas').then((m) => ({ default: m.WorkflowCanvas })),
)
const LazyEditorPanel = lazy(() =>
  import('../../../components/canvas/editor-panel').then((m) => ({ default: m.EditorPanel })),
)

const getCanvasContext = createServerFn({ method: 'GET' }).handler(async () => ({
  localDev: process.env['ENABLE_LOCAL_DEV'] === 'true',
}))

export const Route = createFileRoute('/_authed/workflows/$workflowId/canvas')({
  head: () => ({ meta: [{ title: 'Canvas | AwaitStep' }] }),
  component: WorkflowEditorPageWrapper,
  loader: () => getCanvasContext(),
  validateSearch: (
    search: Record<string, unknown>,
  ): { template?: boolean; version?: string; kind?: 'workflow' | 'script' } => ({
    template: search.template === true || search.template === '1' || search.template === 'true',
    version: typeof search.version === 'string' ? search.version : undefined,
    kind:
      search.kind === 'script' || search.kind === 'workflow'
        ? (search.kind as 'workflow' | 'script')
        : undefined,
  }),
})

function WorkflowEditorPageWrapper() {
  return (
    <NodeRegistryProvider>
      <WorkflowEditorPage />
    </NodeRegistryProvider>
  )
}

function WorkflowEditorPage() {
  const { workflowId } = useParams({ from: '/_authed/workflows/$workflowId/canvas' })
  const {
    template,
    version: versionParam,
    kind: kindParam,
  } = useSearch({
    from: '/_authed/workflows/$workflowId/canvas',
  })
  const showEditor = useWorkflowStore((s) => s.showEditor)
  const setShowEditor = useWorkflowStore((s) => s.setShowEditor)
  const [showLocalTest, setShowLocalTest] = useState(false)
  // Functions never show the template picker — templates are workflow-shaped.
  const [showTemplatePicker, setShowTemplatePicker] = useState(template && kindParam !== 'script')
  const [confirmAction, setConfirmAction] = useState<'switch-template' | null>(null)

  const ready = useOrgReady()
  const { registry: nodeRegistry } = useNodeRegistry()
  const isNew = workflowId === 'new'
  const { localDev: localDevEnabled } = Route.useLoaderData()

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
  const { proceed, reset, status } = useBlocker({
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
    if (workflowError) toast.error('Failed to load workflow')
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
      return
    }
    setWorkflowId(workflowId)
    if (fullData?.workflow) {
      useWorkflowStore.setState(
        buildWorkflowStoreState(fullData.workflow, fullData.version, currentVersion, isReadOnly),
      )
    }
  }, [workflowId, isNew, kindParam, fullData, setWorkflowId, isReadOnly, currentVersion])

  // Persistence (save + deploy)
  const { handleSave, handleDeploy, isSaving } = useWorkflowPersistence({
    workflowId,
    isNew,
    isDirty,
    nodeRegistry,
    kind: kindParam,
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
                showEditor={showEditor}
                onToggleEditor={() => setShowEditor(!showEditor)}
                onSave={handleSave}
                isSaving={isSaving}
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
                <CanvasSidePanels
                  showEditor={showEditor}
                  showLocalTest={showLocalTest && !isNew}
                  onCloseLocalTest={() => setShowLocalTest(false)}
                  workflowId={workflowId}
                  LazyEditorPanel={LazyEditorPanel}
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
            />
          </LazyReactFlowProvider>
        </LoadingView>
      </Suspense>
    </ClientOnly>
  )
}
