import { createFileRoute, useParams, useSearch, useBlocker } from '@tanstack/react-router'
import { lazy, Suspense, useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'
import { NodePalette } from '../../../components/canvas/node-palette'
import { TemplatePicker } from '../../../components/canvas/template-picker'
import { ClientOnly } from '../../../components/canvas/client-only'
import { useWorkflowStore, toFlowType } from '../../../stores/workflow-store'
import type { WorkflowNode } from '@awaitstep/ir'
import { SimulationPanel } from '../../../components/canvas/simulation-panel'
import { NodeRegistryProvider, useNodeRegistry } from '../../../contexts/node-registry-context'
import { validateWorkflowForPublish } from '../../../lib/validate-workflow'
import { api, type WorkflowSummary } from '../../../lib/api-client'
import { buildIRFromState } from '../../../lib/build-ir'
import { EditorToolbar } from '../../../components/canvas/editor-toolbar'
import { EditorDialogs } from '../../../components/canvas/editor-dialogs'
import { CanvasSidePanels } from '../../../components/canvas/canvas-side-panels'

const LazyReactFlowProvider = lazy(() =>
  import('@xyflow/react').then((m) => ({ default: m.ReactFlowProvider })),
)

const LazyCanvas = lazy(() =>
  import('../../../components/canvas/workflow-canvas').then((m) => ({ default: m.WorkflowCanvas })),
)

const LazyEditorPanel = lazy(() =>
  import('../../../components/canvas/editor-panel').then((m) => ({ default: m.EditorPanel })),
)

export const Route = createFileRoute('/_authed/workflows/$workflowId/canvas')({
  component: WorkflowEditorPageWrapper,
  validateSearch: (search: Record<string, unknown>): { template?: boolean } => ({
    template: search.template === true || search.template === '1' || search.template === 'true',
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
  const { template } = useSearch({ from: '/_authed/workflows/$workflowId/canvas' })
  const [showEditor, setShowEditor] = useState(false)
  const [showTemplatePicker, setShowTemplatePicker] = useState(template)
  const [deployOpen, setDeployOpen] = useState(false)
  const [showTrigger, setShowTrigger] = useState(false)
  const [confirmAction, setConfirmAction] = useState<'delete' | 'takedown' | 'switch-template' | null>(null)

  const nodeRegistry = useNodeRegistry()
  const metadata = useWorkflowStore((s) => s.metadata)
  const nodeCount = useWorkflowStore((s) => s.nodes.length)
  const showSettings = useWorkflowStore((s) => s.showSettings)
  const setShowSettings = useWorkflowStore((s) => s.setShowSettings)
  const addNode = useWorkflowStore((s) => s.addNode)
  const runValidation = useWorkflowStore((s) => s.runValidation)
  const runSimulation = useWorkflowStore((s) => s.runSimulation)
  const isDirty = useWorkflowStore((s) => s.isDirty)
  const setWorkflowId = useWorkflowStore((s) => s.setWorkflowId)
  const markClean = useWorkflowStore((s) => s.markClean)

  const isNew = workflowId === 'new'
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  // Block in-app navigation when there are unsaved changes
  const shouldBlock = isDirty || (isNew && nodeCount > 0)
  const { proceed, reset, status } = useBlocker({
    condition: shouldBlock,
  })

  // Block browser refresh/close
  useEffect(() => {
    if (!shouldBlock) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [shouldBlock])

  // Load workflow + version + deployments in a single request
  const { data: fullData, error: workflowError } = useQuery({
    queryKey: ['workflow-full', workflowId],
    queryFn: () => api.getWorkflowFull(workflowId),
    enabled: !isNew,
    retry: false,
  })

  useEffect(() => {
    if (workflowError) {
      toast.error('Failed to load workflow')
    }
  }, [workflowError])

  const serverWorkflow = fullData?.workflow
  const activeDeployment = fullData?.activeDeployment ?? null
  const versions = fullData?.versions

  const hasActiveDeployment = !!activeDeployment
  const currentVersion = versions?.[0]?.version ?? 0
  const deployedVersionId = activeDeployment?.versionId
  const deployedVersion = versions?.find((v) => v.id === deployedVersionId)
  const hasUndeployedChanges = hasActiveDeployment && deployedVersionId && deployedVersionId !== serverWorkflow?.currentVersionId

  // Initialize workflow data
  useEffect(() => {
    // Reset workflow-specific state
    useWorkflowStore.setState({
      inputParams: [],
      envBindings: [],
      workflowEnvVars: [],
      dependencies: {},
      triggerCode: '',
      validationResult: null,
      simulationResult: null,
      isDirty: false,
    })

    if (isNew) {
      setWorkflowId('new')
      return
    }

    setWorkflowId(workflowId)

    if (serverWorkflow) {
      // Hydrate all server data without triggering isDirty
      const serverState: Record<string, unknown> = {
        metadata: {
          name: serverWorkflow.name,
          description: serverWorkflow.description,
          version: currentVersion,
          createdAt: serverWorkflow.createdAt,
          updatedAt: serverWorkflow.updatedAt,
        },
      }

      if (serverWorkflow.envVars) {
        try {
          const parsed = JSON.parse(serverWorkflow.envVars)
          if (Array.isArray(parsed)) serverState.workflowEnvVars = parsed
        } catch { /* ignore malformed */ }
      }
      if (serverWorkflow.triggerCode) {
        serverState.triggerCode = serverWorkflow.triggerCode
      }
      if (serverWorkflow.dependencies) {
        try {
          const parsed = JSON.parse(serverWorkflow.dependencies)
          if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
            serverState.dependencies = parsed
          }
        } catch { /* ignore malformed */ }
      }

      // Load canvas nodes/edges from the version IR
      const versionData = fullData?.version
      if (versionData?.ir) {
        try {
          const ir = JSON.parse(versionData.ir) as { nodes?: WorkflowNode[]; edges?: { id: string; source: string; target: string; label?: string }[] }
          if (ir.nodes && ir.edges) {
            serverState.nodes = ir.nodes.map((irNode: WorkflowNode) => ({
              id: irNode.id,
              type: toFlowType(irNode.type),
              position: irNode.position,
              data: { irNode },
            }))
            serverState.edges = ir.edges
          }
        } catch { /* ignore malformed IR */ }
      }

      useWorkflowStore.setState({ ...serverState, isDirty: false })
    }
  }, [workflowId, isNew, fullData, setWorkflowId])

  // Save to server
  const saveMutation = useMutation({
    mutationFn: async () => {
      const state = useWorkflowStore.getState()
      const ir = buildIRFromState(state)

      const envVars = state.workflowEnvVars.length > 0 ? state.workflowEnvVars : undefined
      const triggerCode = state.triggerCode || undefined
      const dependencies = Object.keys(state.dependencies).length > 0 ? state.dependencies : undefined

      if (isNew) {
        const created = await api.createWorkflow({ name: state.metadata.name, description: state.metadata.description })
        if (envVars || triggerCode || dependencies) await api.updateWorkflow(created.id, { envVars, triggerCode, dependencies })
        await api.createVersion(created.id, { ir })
        return created
      }

      await api.updateWorkflow(workflowId, { name: state.metadata.name, description: state.metadata.description, envVars, triggerCode, dependencies })
      await api.createVersion(workflowId, { ir })
      return null
    },
    onSuccess: (created: WorkflowSummary | null) => {
      markClean()
      toast.success('Workflow saved')
      queryClient.invalidateQueries({ queryKey: ['workflow-full', workflowId] })
      if (created) {
        window.history.replaceState(null, '', `/workflows/${created.id}/canvas`)
        setWorkflowId(created.id)
      }
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to save workflow')
    },
  })

  const handleSave = useCallback(() => {
    const state = useWorkflowStore.getState()
    const result = validateWorkflowForPublish(state.metadata, state.nodes, state.edges)
    if (!result.canPublish) {
      const errors = result.issues.filter((i) => i.severity === 'error')
      for (const issue of errors) {
        toast.error(issue.nodeName ? `${issue.nodeName}: ${issue.message}` : issue.message)
      }
      return
    }
    saveMutation.mutate()
  }, [saveMutation])

  const handleDeploy = useCallback(async () => {
    const result = runValidation(nodeRegistry)
    if (!result.canPublish) {
      const errors = result.issues.filter((i) => i.severity === 'error')
      const warnings = result.issues.filter((i) => i.severity === 'warning')
      for (const issue of errors) {
        toast.error(issue.nodeName ? `${issue.nodeName}: ${issue.message}` : issue.message)
      }
      for (const issue of warnings) {
        toast.warning(issue.nodeName ? `${issue.nodeName}: ${issue.message}` : issue.message)
      }
      return
    }
    if (isDirty || isNew) {
      try {
        await saveMutation.mutateAsync()
      } catch {
        toast.error('Failed to save before deploy')
        return
      }
    }
    setDeployOpen(true)
  }, [runValidation, isDirty, isNew, saveMutation, nodeRegistry])

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteWorkflow(workflowId),
    onSuccess: () => {
      toast.success('Workflow deleted')
      queryClient.invalidateQueries({ queryKey: ['workflows'] })
      navigate({ to: '/dashboard' })
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to delete'),
  })

  const takedownMutation = useMutation({
    mutationFn: (connectionId: string) => api.takedownDeployment(workflowId, connectionId),
    onSuccess: (result) => {
      if (result.success) {
        toast.success('Deployment taken down')
        queryClient.invalidateQueries({ queryKey: ['workflow-full', workflowId] })
      } else {
        toast.error(result.error ?? 'Failed to take down deployment')
      }
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to take down'),
  })

  const handleAddNode = (type: Parameters<typeof addNode>[0]) => {
    addNode(type, { x: 250 + Math.random() * 200, y: 150 + Math.random() * 200 })
  }

  return (
    <ClientOnly
      fallback={
        <div className="fixed inset-0 flex items-center justify-center bg-background">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground/60" />
        </div>
      }
    >
      <Suspense
        fallback={
          <div className="fixed inset-0 flex items-center justify-center bg-background">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground/60" />
          </div>
        }
      >
        <LazyReactFlowProvider>
          <div className="fixed inset-0 flex flex-col overflow-hidden bg-background">
            <EditorToolbar
              workflowId={workflowId}
              isNew={isNew}
              workflowName={metadata.name}
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
              isSaving={saveMutation.isPending}
              onDeploy={handleDeploy}
              onTest={() => runSimulation()}
              onTrigger={() => setShowTrigger(true)}
              onDelete={() => setConfirmAction('delete')}
              onTakedown={() => setConfirmAction('takedown')}
              onOpenTemplatePicker={() => {
                if (nodeCount > 0) {
                  setConfirmAction('switch-template')
                } else {
                  setShowTemplatePicker(true)
                }
              }}
            />

            {/* Canvas + Overlay Panels */}
            <div className="relative flex-1 overflow-hidden">
              <LazyCanvas />
              <div className="absolute left-4 top-4 z-10">
                <NodePalette onAddNode={handleAddNode} />
              </div>
              {isNew && showTemplatePicker && (
                <TemplatePicker onDismiss={() => setShowTemplatePicker(false)} />
              )}

              <SimulationPanel />

              <CanvasSidePanels showEditor={showEditor} LazyEditorPanel={LazyEditorPanel} />
            </div>
          </div>
          <EditorDialogs
            confirmAction={confirmAction}
            setConfirmAction={setConfirmAction}
            onConfirmDelete={(opts) => deleteMutation.mutate(undefined, opts)}
            isDeleting={deleteMutation.isPending}
            onConfirmTakedown={(connectionId, opts) => takedownMutation.mutate(connectionId, opts)}
            isTakingDown={takedownMutation.isPending}
            onConfirmSwitchTemplate={() => setShowTemplatePicker(true)}
            blockerStatus={status}
            onBlockerProceed={proceed}
            onBlockerReset={reset}
            showTrigger={showTrigger}
            onCloseTrigger={() => setShowTrigger(false)}
            deployOpen={deployOpen}
            onCloseDeploy={() => setDeployOpen(false)}
            workflowId={workflowId}
            activeDeploymentServiceName={activeDeployment?.serviceName}
          />
        </LazyReactFlowProvider>
      </Suspense>
    </ClientOnly>
  )
}
