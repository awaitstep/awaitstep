import { createFileRoute, useParams, useSearch, useBlocker } from '@tanstack/react-router'
import { lazy, Suspense, useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'
import { NodePalette } from '../../../components/canvas/node-palette'
import { TemplatePicker } from '../../../components/canvas/template-picker'
import { ClientOnly } from '../../../components/canvas/client-only'
import { useWorkflowStore } from '../../../stores/workflow-store'
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

const LazyCodePreview = lazy(() =>
  import('../../../components/canvas/code-preview').then((m) => ({ default: m.CodePreview })),
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
  const [showCode, setShowCode] = useState(false)
  const [showTemplatePicker, setShowTemplatePicker] = useState(template)
  const [deployOpen, setDeployOpen] = useState(false)
  const [showTrigger, setShowTrigger] = useState(false)
  const [showEntryEditor, setShowEntryEditor] = useState(false)
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
  const loadFromLocal = useWorkflowStore((s) => s.loadFromLocal)
  const loadWorkflow = useWorkflowStore((s) => s.loadWorkflow)
  const setMetadata = useWorkflowStore((s) => s.setMetadata)
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

  // Load workflow from server when editing an existing workflow
  const { data: serverWorkflow } = useQuery({
    queryKey: ['workflow', workflowId],
    queryFn: () => api.getWorkflow(workflowId),
    enabled: !isNew,
  })

  const { data: deployments } = useQuery({
    queryKey: ['deployments', workflowId],
    queryFn: () => api.listDeployments(workflowId),
    enabled: !isNew,
  })

  const hasActiveDeployment = deployments?.some((d) => d.status === 'success') ?? false
  const activeDeployment = deployments?.find((d) => d.status === 'success')

  const { data: versions } = useQuery({
    queryKey: ['versions', workflowId],
    queryFn: () => api.listVersions(workflowId),
    enabled: !isNew,
  })

  const currentVersion = versions?.[0]?.version ?? 0
  const deployedVersionId = activeDeployment?.versionId
  const deployedVersion = versions?.find((v) => v.id === deployedVersionId)
  const hasUndeployedChanges = hasActiveDeployment && deployedVersionId && deployedVersionId !== serverWorkflow?.currentVersionId

  // Initialize workflow data
  useEffect(() => {
    if (isNew) {
      setWorkflowId('new')
      return
    }

    setWorkflowId(workflowId)

    // Try loading from localStorage first (may have unsaved changes)
    if (loadFromLocal(workflowId)) return

    // Fall back to server data
    if (serverWorkflow) {
      setMetadata({
        name: serverWorkflow.name,
        description: serverWorkflow.description,
      })
      markClean()
    }
  }, [workflowId, isNew, serverWorkflow, setWorkflowId, loadFromLocal, setMetadata, loadWorkflow, markClean])

  // Save to server
  const saveMutation = useMutation({
    mutationFn: async () => {
      const state = useWorkflowStore.getState()
      const ir = buildIRFromState(state)

      if (isNew) {
        const created = await api.createWorkflow({ name: state.metadata.name, description: state.metadata.description })
        await api.createVersion(created.id, { ir })
        return created
      }

      await api.updateWorkflow(workflowId, { name: state.metadata.name, description: state.metadata.description })
      await api.createVersion(workflowId, { ir })
      return null
    },
    onSuccess: (created: WorkflowSummary | null) => {
      markClean()
      toast.success('Workflow saved')
      queryClient.invalidateQueries({ queryKey: ['versions', workflowId] })
      queryClient.invalidateQueries({ queryKey: ['workflow', workflowId] })
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
        queryClient.invalidateQueries({ queryKey: ['workflow', workflowId] })
        queryClient.invalidateQueries({ queryKey: ['deployments', workflowId] })
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
              showCode={showCode}
              onToggleCode={() => setShowCode(!showCode)}
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

              <CanvasSidePanels showCode={showCode} LazyCodePreview={LazyCodePreview} onEditEntry={() => setShowEntryEditor(true)} />
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
            showEntryEditor={showEntryEditor}
            onCloseEntryEditor={() => setShowEntryEditor(false)}
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
