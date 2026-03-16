import { createFileRoute, Link, useParams } from '@tanstack/react-router'
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
} from 'lucide-react'
import { Button } from '../../../components/ui/button'
import { NodePalette } from '../../../components/canvas/node-palette'
import { NodeConfigPanel } from '../../../components/canvas/node-config-panel'
import { WorkflowSettings } from '../../../components/canvas/workflow-settings'
import { TemplatePicker } from '../../../components/canvas/template-picker'
import { ClientOnly } from '../../../components/canvas/client-only'
import { useWorkflowStore } from '../../../stores/workflow-store'
import { SimulationPanel } from '../../../components/canvas/simulation-panel'
import { cn } from '../../../lib/utils'
import { validateWorkflowForPublish } from '../../../lib/validate-workflow'
import { api, type WorkflowSummary } from '../../../lib/api-client'
import { ConfirmDialog } from '../../../components/ui/confirm-dialog'

const LazyReactFlowProvider = lazy(() =>
  import('@xyflow/react').then((m) => ({ default: m.ReactFlowProvider })),
)

const LazyCanvas = lazy(() =>
  import('../../../components/canvas/workflow-canvas').then((m) => ({ default: m.WorkflowCanvas })),
)

const LazyCodePreview = lazy(() =>
  import('../../../components/canvas/code-preview').then((m) => ({ default: m.CodePreview })),
)

export const Route = createFileRoute('/_authed/workflows/$workflowId/')({
  component: WorkflowEditorPage,
})

function WorkflowEditorPage() {
  const { workflowId } = useParams({ from: '/_authed/workflows/$workflowId/' })
  const [showCode, setShowCode] = useState(false)
  const [showTemplatePicker, setShowTemplatePicker] = useState(true)

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

  // Load workflow from server when editing an existing workflow
  const { data: serverWorkflow } = useQuery({
    queryKey: ['workflow', workflowId],
    queryFn: () => api.getWorkflow(workflowId),
    enabled: !isNew,
  })

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
      if (created) {
        // Navigate to the created workflow (for new workflows)
        window.history.replaceState(null, '', `/workflows/${created.id}`)
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

  const [confirmAction, setConfirmAction] = useState<'delete' | 'takedown' | null>(null)

  const handleAddNode = (type: Parameters<typeof addNode>[0]) => {
    addNode(type, { x: 250 + Math.random() * 200, y: 150 + Math.random() * 200 })
  }

  return (
    <ClientOnly
      fallback={
        <div className="fixed inset-0 flex items-center justify-center bg-[oklch(0.11_0_0)]">
          <Loader2 className="h-6 w-6 animate-spin text-white/30" />
        </div>
      }
    >
      <Suspense
        fallback={
          <div className="fixed inset-0 flex items-center justify-center bg-[oklch(0.11_0_0)]">
            <Loader2 className="h-6 w-6 animate-spin text-white/30" />
          </div>
        }
      >
        <LazyReactFlowProvider>
          <div className="fixed inset-0 flex flex-col overflow-hidden bg-[oklch(0.11_0_0)]">
            {/* Toolbar */}
            <header className="relative z-20 flex h-14 shrink-0 items-center justify-between border-b border-white/[0.06] bg-[oklch(0.13_0_0)] px-4">
              <div className="flex items-center gap-2">
                <Link to="/dashboard">
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-white/40 hover:text-white/80">
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                </Link>
                <div className="h-5 w-px bg-white/[0.08]" />
                <div className="flex items-center gap-2 px-1">
                  <span className="text-[13px] font-semibold text-white/90">{metadata.name}</span>
                  <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-medium text-white/30">
                    v{metadata.version}
                  </span>
                  {nodeCount > 0 && (
                    <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                      {nodeCount} node{nodeCount !== 1 ? 's' : ''}
                    </span>
                  )}
                  {serverWorkflow?.currentVersionId && (
                    <Link
                      to="/workflows/$workflowId/deployments"
                      params={{ workflowId }}
                      className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                    >
                      deployed
                    </Link>
                  )}
                  {isDirty && (
                    <Circle className="h-2 w-2 fill-amber-400 text-amber-400" />
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
                    isDirty ? 'text-white/70 hover:text-white/90' : 'text-white/30',
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
                    showSettings ? 'bg-white/[0.08] text-white/90' : 'text-white/40 hover:text-white/70',
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
                    showCode ? 'bg-white/[0.08] text-white/90' : 'text-white/40 hover:text-white/70',
                  )}
                >
                  {showCode ? <PanelRightClose className="h-3.5 w-3.5" /> : <Code2 className="h-3.5 w-3.5" />}
                  <span className="text-xs">Code</span>
                </Button>
                <div className="h-5 w-px bg-white/[0.08]" />
                <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2.5 text-white/50 hover:text-white/80" onClick={() => runSimulation()}>
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
                  const currentId = useWorkflowStore.getState().workflowId
                  navigate({ to: '/workflows/$workflowId/deployments', params: { workflowId: currentId ?? workflowId } })
                }}>
                  <Rocket className="h-3.5 w-3.5" />
                  <span className="text-xs">Deploy</span>
                </Button>
                <div className="relative">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-white/40 hover:text-white/70"
                    onClick={() => setShowMenu(!showMenu)}
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                  {showMenu && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
                      <div className="absolute right-0 top-full z-50 mt-1 w-52 rounded-lg border border-white/[0.08] bg-[oklch(0.15_0_0)] p-1 shadow-xl">
                        {serverWorkflow?.currentVersionId && (
                          <button
                            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-amber-400 hover:bg-white/[0.06]"
                            onClick={() => { setShowMenu(false); setConfirmAction('takedown') }}
                          >
                            <CloudOff className="h-4 w-4" />
                            Take down deployment
                          </button>
                        )}
                        {!isNew && (
                          <button
                            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-red-400 hover:bg-white/[0.06]"
                            onClick={() => { setShowMenu(false); setConfirmAction('delete') }}
                          >
                            <Trash2 className="h-4 w-4" />
                            Delete workflow
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </header>

            {/* Canvas + Overlay Panels */}
            <div className="relative flex-1 overflow-hidden">
              {nodeCount === 0 && showTemplatePicker ? (
                <TemplatePicker onDismiss={() => setShowTemplatePicker(false)} />
              ) : (
                <>
                  <LazyCanvas />
                  <div className="absolute left-4 top-4 z-10">
                    <NodePalette onAddNode={handleAddNode} />
                  </div>
                </>
              )}

              <SimulationPanel />

              {/* Side panels — overlay on canvas from the right */}
              {(showSettings || (!showSettings && selectedNodeId) || showCode) && (
                <div className="absolute right-0 top-0 z-10 flex h-full">
                  {showSettings && (
                    <aside className="h-full w-[380px] border-l border-white/[0.06] bg-[oklch(0.13_0_0)] shadow-[-4px_0_24px_rgba(0,0,0,0.4)]">
                      <WorkflowSettings />
                    </aside>
                  )}
                  {!showSettings && selectedNodeId && (
                    <aside className="h-full w-[380px] border-l border-white/[0.06] bg-[oklch(0.13_0_0)] shadow-[-4px_0_24px_rgba(0,0,0,0.4)]">
                      <NodeConfigPanel />
                    </aside>
                  )}
                  {showCode && (
                    <aside className="h-full w-[380px] border-l border-white/[0.06] bg-[oklch(0.13_0_0)] shadow-[-4px_0_24px_rgba(0,0,0,0.4)]">
                      <Suspense fallback={<div className="flex h-full items-center justify-center"><Loader2 className="h-4 w-4 animate-spin text-white/20" /></div>}>
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
        </LazyReactFlowProvider>
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
