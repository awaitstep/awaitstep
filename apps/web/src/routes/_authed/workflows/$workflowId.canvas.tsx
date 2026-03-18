import { createFileRoute, Link, useParams, useSearch, useBlocker } from '@tanstack/react-router'
import { lazy, Suspense, useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import {
  ArrowLeft,
  Code2,
  PanelRightClose,
  Settings2,
  Play,
  Rocket,
  Loader2,
  Save,
  Circle,
  MoreVertical,
  Trash2,
  CloudOff,
  LayoutTemplate,
} from 'lucide-react'
import { Button } from '../../../components/ui/button'
import { NodePalette } from '../../../components/canvas/node-palette'
import { NodeConfigPanel } from '../../../components/canvas/node-config-panel'
import { WorkflowSettings } from '../../../components/canvas/workflow-settings'
import { TemplatePicker } from '../../../components/canvas/template-picker'
import { ClientOnly } from '../../../components/canvas/client-only'
import { useWorkflowStore } from '../../../stores/workflow-store'
import { SimulationPanel } from '../../../components/canvas/simulation-panel'
import { NodeRegistryProvider } from '../../../contexts/node-registry-context'
import { cn } from '../../../lib/utils'
import { validateWorkflowForPublish } from '../../../lib/validate-workflow'
import { DeployDialog } from '../../../components/canvas/deploy-dialog'
import { api, type WorkflowSummary } from '../../../lib/api-client'
import { ConfirmDialog } from '../../../components/ui/confirm-dialog'
import { TriggerDialog } from '../../../components/canvas/trigger-dialog'

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
  component: WorkflowEditorPage,
  validateSearch: (search: Record<string, unknown>): { template?: boolean } => ({
    template: search.template === true || search.template === '1' || search.template === 'true',
  }),
})

function WorkflowEditorPage() {
  const { workflowId } = useParams({ from: '/_authed/workflows/$workflowId/canvas' })
  const { template } = useSearch({ from: '/_authed/workflows/$workflowId/canvas' })
  const [showCode, setShowCode] = useState(false)
  const [showTemplatePicker, setShowTemplatePicker] = useState(template)
  const [deployOpen, setDeployOpen] = useState(false)

  const metadata = useWorkflowStore((s) => s.metadata)
  const nodeCount = useWorkflowStore((s) => s.nodes.length)
  const selectedNodeId = useWorkflowStore((s) => s.selectedNodeId)
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
        // Navigate to the created workflow canvas (for new workflows)
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

  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [showMenu, setShowMenu] = useState(false)
  const [showTrigger, setShowTrigger] = useState(false)

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

  const [confirmAction, setConfirmAction] = useState<'delete' | 'takedown' | 'switch-template' | null>(null)

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
        <NodeRegistryProvider>
        <LazyReactFlowProvider>
          <div className="fixed inset-0 flex flex-col overflow-hidden bg-background">
            {/* Toolbar */}
            <header className="relative z-20 flex h-14 shrink-0 items-center justify-between border-b border-border bg-card px-4">
              <div className="flex items-center gap-2">
                <Link to={isNew ? '/dashboard' : '/workflows/$workflowId'} params={isNew ? undefined : { workflowId }}>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground/80">
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                </Link>
                <div className="h-5 w-px bg-muted/70" />
                <div className="flex items-center gap-2 px-1">
                  <span className="text-[13px] font-semibold text-foreground">{metadata.name}</span>
                  {!isNew && currentVersion > 0 && (
                    <span className="rounded bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground/60">
                      v{currentVersion}
                    </span>
                  )}
                  {nodeCount > 0 && (
                    <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                      {nodeCount} node{nodeCount !== 1 ? 's' : ''}
                    </span>
                  )}
                  {hasActiveDeployment && (
                    <Link
                      to="/workflows/$workflowId/deployments"
                      params={{ workflowId }}
                      className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                        hasUndeployedChanges
                          ? 'bg-amber-500/10 text-status-warning hover:bg-amber-500/20'
                          : 'bg-emerald-500/10 text-status-success hover:bg-emerald-500/20'
                      }`}
                    >
                      {hasUndeployedChanges
                        ? `deployed v${deployedVersion?.version ?? '?'} · v${currentVersion} unsaved`
                        : `deployed v${currentVersion}`}
                    </Link>
                  )}
                  {isDirty && (
                    <Circle className="h-2 w-2 fill-status-warning text-status-warning" />
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSave}
                  disabled={saveMutation.isPending || !isDirty}
                  className={cn(
                    'h-8 gap-1.5 px-2.5',
                    isDirty ? 'text-foreground/70 hover:text-foreground' : 'text-muted-foreground/60',
                  )}
                >
                  {saveMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="h-3.5 w-3.5" />
                  )}
                  <span className="text-xs">Save</span>
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowSettings(!showSettings)}
                  className={cn(
                    'h-8 w-8',
                    showSettings ? 'bg-muted/70 text-foreground' : 'text-muted-foreground hover:text-foreground/70',
                  )}
                >
                  <Settings2 className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowCode(!showCode)}
                  className={cn(
                    'h-8 gap-1.5 px-2.5',
                    showCode ? 'bg-muted/70 text-foreground' : 'text-muted-foreground hover:text-foreground/70',
                  )}
                >
                  {showCode ? <PanelRightClose className="h-3.5 w-3.5" /> : <Code2 className="h-3.5 w-3.5" />}
                  <span className="text-xs">Code</span>
                </Button>
                {isNew && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1.5 px-2.5 text-muted-foreground hover:text-foreground/70"
                    onClick={() => {
                      if (nodeCount > 0) {
                        setConfirmAction('switch-template')
                      } else {
                        setShowTemplatePicker(true)
                      }
                    }}
                  >
                    <LayoutTemplate className="h-3.5 w-3.5" />
                    <span className="text-xs">Templates</span>
                  </Button>
                )}
                <div className="h-5 w-px bg-muted/70" />
                <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2.5 text-muted-foreground hover:text-foreground/80" onClick={() => runSimulation()}>
                  <Play className="h-3.5 w-3.5" />
                  <span className="text-xs">Test</span>
                </Button>
                <Button size="sm" className="h-8 gap-1.5 px-3" onClick={async () => {
                  const result = runValidation()
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
                }}>
                  <Rocket className="h-3.5 w-3.5" />
                  <span className="text-xs">Deploy</span>
                </Button>
                {hasActiveDeployment && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1.5 px-2.5 text-status-success/70 hover:text-status-success"
                    onClick={() => setShowTrigger(true)}
                  >
                    <Play className="h-3.5 w-3.5" />
                    <span className="text-xs">Trigger</span>
                  </Button>
                )}
                {(!isNew || hasActiveDeployment) && <div className="relative">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-foreground/70"
                    onClick={() => setShowMenu(!showMenu)}
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                  {showMenu && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
                      <div className="absolute right-0 top-full z-50 mt-1 w-52 rounded-lg border border-border bg-card p-1 shadow-xl">
                        {hasActiveDeployment && (
                          <button
                            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-status-warning hover:bg-muted/60"
                            onClick={() => { setShowMenu(false); setConfirmAction('takedown') }}
                          >
                            <CloudOff className="h-4 w-4" />
                            Take down deployment
                          </button>
                        )}
                        {!isNew && (
                          <button
                            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-status-error hover:bg-muted/60"
                            onClick={() => { setShowMenu(false); setConfirmAction('delete') }}
                          >
                            <Trash2 className="h-4 w-4" />
                            Delete workflow
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>}
              </div>
            </header>

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

              {/* Side panels — overlay on canvas from the right */}
              {(showSettings || (!showSettings && selectedNodeId) || showCode) && (
                <div className="absolute right-0 top-0 z-10 flex h-full">
                  {showSettings && (
                    <aside className="h-full w-[380px] border-l border-border bg-card shadow-lg">
                      <WorkflowSettings />
                    </aside>
                  )}
                  {!showSettings && selectedNodeId && (
                    <aside className="h-full w-[380px] border-l border-border bg-card shadow-lg">
                      <NodeConfigPanel />
                    </aside>
                  )}
                  {showCode && (
                    <aside className="h-full w-[380px] border-l border-border bg-card shadow-lg">
                      <Suspense fallback={<div className="flex h-full items-center justify-center"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground/40" /></div>}>
                        <LazyCodePreview />
                      </Suspense>
                    </aside>
                  )}
                </div>
              )}
            </div>
          </div>
          <ConfirmDialog
            open={confirmAction === 'delete'}
            onOpenChange={(open) => { if (!open) setConfirmAction(null) }}
            title="Delete workflow"
            description="This will permanently delete this workflow and all its versions. This cannot be undone."
            confirmLabel="Delete"
            variant="destructive"
            loading={deleteMutation.isPending}
            onConfirm={() => {
              deleteMutation.mutate(undefined, { onSettled: () => setConfirmAction(null) })
            }}
          />
          <ConfirmDialog
            open={confirmAction === 'switch-template'}
            onOpenChange={(open) => { if (!open) setConfirmAction(null) }}
            title="Switch template?"
            description="Your current canvas will be replaced. Any unsaved work will be lost."
            confirmLabel="Browse templates"
            variant="warning"
            onConfirm={() => {
              setConfirmAction(null)
              setShowTemplatePicker(true)
            }}
          />
          <ConfirmDialog
            open={confirmAction === 'takedown'}
            onOpenChange={(open) => { if (!open) setConfirmAction(null) }}
            title="Take down deployment"
            description="This will delete the worker from Cloudflare. The workflow will remain in your account but will no longer be running."
            confirmLabel="Take down"
            variant="warning"
            loading={takedownMutation.isPending}
            onConfirm={async () => {
              const conns = await api.listConnections()
              if (conns.length === 0) {
                toast.error('No connection available to take down deployment')
                setConfirmAction(null)
                return
              }
              takedownMutation.mutate(conns[0].id, { onSettled: () => setConfirmAction(null) })
            }}
          />
          <ConfirmDialog
            open={status === 'blocked'}
            onOpenChange={(open) => { if (!open) reset?.() }}
            title="Unsaved changes"
            description="You have unsaved changes that will be lost if you leave this page."
            confirmLabel="Leave"
            variant="warning"
            onConfirm={() => proceed?.()}
          />
          <TriggerDialog
            open={showTrigger}
            onClose={() => setShowTrigger(false)}
            workflowId={workflowId}
            deploymentId={deployments?.find((d) => d.status === 'success')?.serviceName}
          />
          <DeployDialog
            open={deployOpen}
            onClose={() => setDeployOpen(false)}
            workflowId={workflowId}
          />
        </LazyReactFlowProvider>
        </NodeRegistryProvider>
      </Suspense>
    </ClientOnly>
  )
}

type StoreState = ReturnType<typeof useWorkflowStore.getState>

function findEntryNodeId(nodes: { id: string }[], edges: { source: string; target: string }[]): string {
  const targets = new Set(edges.map((e) => e.target))
  const roots = nodes.filter((n) => !targets.has(n.id))
  if (roots.length <= 1) return roots[0]?.id ?? nodes[0]?.id ?? ''

  // Multiple roots — pick the one with the most descendants
  const adj = new Map<string, string[]>()
  for (const n of nodes) adj.set(n.id, [])
  for (const e of edges) adj.get(e.source)?.push(e.target)

  let bestId = roots[0]!.id
  let bestCount = 0
  for (const root of roots) {
    let count = 0
    const visited = new Set<string>()
    const queue = [root.id]
    while (queue.length > 0) {
      const id = queue.shift()!
      if (visited.has(id)) continue
      visited.add(id)
      count++
      for (const n of adj.get(id) ?? []) queue.push(n)
    }
    if (count > bestCount) {
      bestCount = count
      bestId = root.id
    }
  }
  return bestId
}

function buildIRFromState(state: Pick<StoreState, 'metadata' | 'nodes' | 'edges'>) {
  const irNodes = state.nodes.map((n) => n.data.irNode)
  const irEdges = state.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    ...(e.label ? { label: String(e.label) } : {}),
  }))
  return {
    metadata: state.metadata,
    nodes: irNodes,
    edges: irEdges,
    entryNodeId: findEntryNodeId(irNodes, irEdges),
  }
}
