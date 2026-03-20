import { createFileRoute, Link, useParams, redirect } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useRef, useEffect } from 'react'
import { toast } from 'sonner'
import type { WorkflowNode, Edge as IREdge } from '@awaitstep/ir'
import { validateWorkflowForPublish } from '../../../lib/validate-workflow'
import {
  Loader2,
  Pencil,
  Rocket,
  Clock,
  ExternalLink,
  Hash,
} from 'lucide-react'
import { Button } from '../../../components/ui/button'
import { api } from '../../../lib/api-client'
import { timeAgo, formatDate } from '../../../lib/time'
import { RunStatusBadge } from '../../../components/monitoring/run-status-badge'
import { RunDetailSheet } from '../../../components/monitoring/run-detail-sheet'
import { WorkflowActionsMenu } from '../../../components/dashboard/workflow-actions-menu'
import { TriggerButton } from '../../../components/dashboard/trigger-button'
import { DeployDialog } from '../../../components/canvas/deploy-dialog'

export const Route = createFileRoute('/_authed/workflows/$workflowId/')({
  beforeLoad: ({ params }) => {
    if (params.workflowId === 'new') {
      throw redirect({ to: '/workflows/$workflowId/canvas', params })
    }
  },
  component: WorkflowOverviewPage,
})


function WorkflowOverviewPage() {
  const { workflowId } = useParams({ from: '/_authed/workflows/$workflowId/' })
  const [deployOpen, setDeployOpen] = useState(false)
  const [selectedRun, setSelectedRun] = useState<{ id: string; workflowId: string } | null>(null)

  const { data: workflow, isLoading: wfLoading } = useQuery({
    queryKey: ['workflow', workflowId],
    queryFn: () => api.getWorkflow(workflowId),
  })

  const { data: versions } = useQuery({
    queryKey: ['versions', workflowId],
    queryFn: () => api.listVersions(workflowId),
  })

  const { data: deployments } = useQuery({
    queryKey: ['deployments', workflowId],
    queryFn: () => api.listDeployments(workflowId),
  })

  const { data: runs } = useQuery({
    queryKey: ['runs', workflowId],
    queryFn: () => api.listAllRuns(),
  })

  const workflowRuns = runs?.filter((r) => r.workflowId === workflowId) ?? []
  const currentVersion = versions?.[0]?.version ?? 0
  const activeDeployment = deployments?.find((d) => d.status === 'success')
  const hasActiveDeployment = !!activeDeployment
  const latestDeployment = deployments?.[0]
  const deployedVersion = versions?.find((v) => v.id === activeDeployment?.versionId)
  const hasUndeployedChanges = hasActiveDeployment && activeDeployment.versionId !== workflow?.currentVersionId

  if (wfLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground/60" />
      </div>
    )
  }

  if (!workflow) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-sm text-muted-foreground">Workflow not found</p>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <EditableName workflowId={workflowId} initialValue={workflow.name} />
          <EditableDescription workflowId={workflowId} initialValue={workflow.description ?? ''} />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link to="/workflows/$workflowId/canvas" params={{ workflowId }}>
            <Button size="sm" variant="outline" className="gap-1.5">
              <Pencil className="h-3.5 w-3.5" />
              Open Editor
            </Button>
          </Link>
          <Button size="sm" className="gap-1.5" onClick={async () => {
            if (!workflow?.currentVersionId) {
              toast.error('No version to deploy. Open the editor and save your workflow first.')
              return
            }
            try {
              const ver = await api.getVersion(workflowId, workflow.currentVersionId)
              const ir = JSON.parse(ver.ir) as { metadata: { name: string; description?: string }; nodes: WorkflowNode[]; edges: IREdge[] }
              const flowNodes = ir.nodes.map((n) => ({ id: n.id, type: n.type, position: n.position, data: { irNode: n } }))
              const flowEdges = ir.edges.map((e) => ({ id: e.id, source: e.source, target: e.target, label: e.label }))
              const result = validateWorkflowForPublish(ir.metadata, flowNodes, flowEdges)
              if (!result.canPublish) {
                const errors = result.issues.filter((i) => i.severity === 'error')
                for (const issue of errors) {
                  toast.error(issue.nodeName ? `${issue.nodeName}: ${issue.message}` : issue.message)
                }
                return
              }
            } catch {
              toast.error('Failed to validate workflow')
              return
            }
            setDeployOpen(true)
          }}>
            <Rocket className="h-3.5 w-3.5" />
            Deploy
          </Button>
          {hasActiveDeployment && <TriggerButton workflowId={workflowId} />}
          <WorkflowActionsMenu workflow={workflow} isDeployed={hasActiveDeployment} />
        </div>
      </div>

      {/* Info row */}
      <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5" />
          Created {timeAgo(workflow.createdAt)}
        </span>
        <span>Updated {timeAgo(workflow.updatedAt)}</span>
        {currentVersion > 0 && (
          <span className="rounded bg-muted/60 px-1.5 py-0.5 font-medium text-muted-foreground">
            v{currentVersion}
          </span>
        )}
        <DeployStatusBadge
          hasActiveDeployment={hasActiveDeployment}
          hasUndeployedChanges={!!hasUndeployedChanges}
          deployedVersion={deployedVersion?.version}
        />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        {/* Versions */}
        <section>
          <h2 className="text-sm font-semibold text-foreground/70">Versions</h2>
          {versions && versions.length > 0 ? (
            <div className="mt-3 rounded-md border border-border">
              {versions.slice(0, 10).map((v, i) => (
                <div
                  key={v.id}
                  className={`flex items-center justify-between px-3 py-2.5 ${
                    i < Math.min(versions.length, 10) - 1 ? 'border-b border-border' : ''
                  }`}
                >
                  <div className="flex items-center gap-1.5 text-xs text-foreground/60">
                    <Hash className="h-3 w-3 text-muted-foreground/40" />
                    v{v.version}
                    {v.id === activeDeployment?.versionId && (
                      <span className="rounded bg-status-success/10 px-1.5 py-0.5 text-[10px] font-medium text-status-success">deployed</span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground/60">{timeAgo(v.createdAt)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-3 rounded-md border border-border px-4 py-6 text-center text-xs text-muted-foreground">
              No versions yet. Open the editor to create one.
            </div>
          )}
        </section>

        {/* Recent Runs */}
        <section>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground/70">Recent Runs</h2>
            {workflowRuns.length > 0 && (
              <Link
                to="/workflows/$workflowId/runs"
                params={{ workflowId }}
                className="text-[11px] text-muted-foreground/60 hover:text-muted-foreground"
              >
                View all
              </Link>
            )}
          </div>
          {workflowRuns.length > 0 ? (
            <div className="mt-3 rounded-md border border-border">
              {workflowRuns.slice(0, 8).map((run, i) => (
                <button
                  key={run.id}
                  onClick={() => setSelectedRun({ id: run.id, workflowId })}
                  className={`flex w-full items-center justify-between px-3 py-2.5 text-left transition-colors hover:bg-muted/30 ${
                    i < Math.min(workflowRuns.length, 8) - 1 ? 'border-b border-border' : ''
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <RunStatusBadge status={run.status} />
                    <span className="font-mono text-xs text-muted-foreground">{run.instanceId.slice(0, 12)}</span>
                  </div>
                  <span className="text-xs text-muted-foreground/60">{timeAgo(run.createdAt)}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="mt-3 rounded-md border border-border px-4 py-6 text-center text-xs text-muted-foreground">
              No runs yet. Deploy and trigger your workflow to see runs here.
            </div>
          )}
        </section>
      </div>

      {/* Deployment card */}
      {latestDeployment && (
        <section className="mt-6">
          <h2 className="text-sm font-semibold text-foreground/70">Latest Deployment</h2>
          <div className="mt-3 rounded-md border border-border bg-muted/30 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <DeployStatusDot status={latestDeployment.status} />
                <div>
                  <p className="text-sm text-foreground/70">
                    {latestDeployment.status === 'success' ? 'Deployed' : latestDeployment.status === 'failed' ? 'Failed' : 'Deploying'}
                  </p>
                  <p className="text-xs text-muted-foreground/60">{formatDate(latestDeployment.createdAt)}</p>
                </div>
              </div>
              {latestDeployment.serviceUrl && (
                <a
                  href={latestDeployment.serviceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-status-info hover:underline"
                >
                  <ExternalLink className="h-3 w-3" />
                  {latestDeployment.serviceUrl.replace(/^https?:\/\//, '')}
                </a>
              )}
            </div>
            {latestDeployment.error && (
              <p className="mt-2 rounded bg-status-error/10 px-3 py-2 text-xs text-status-error">{latestDeployment.error}</p>
            )}
          </div>
        </section>
      )}

      <RunDetailSheet
        run={selectedRun}
        onClose={() => setSelectedRun(null)}
      />
      <DeployDialog open={deployOpen} onClose={() => setDeployOpen(false)} workflowId={workflowId} />
    </div>
  )
}

function EditableName({ workflowId, initialValue }: { workflowId: string; initialValue: string }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(initialValue)
  const inputRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()

  useEffect(() => { setValue(initialValue) }, [initialValue])
  useEffect(() => { if (editing) inputRef.current?.select() }, [editing])

  const mutation = useMutation({
    mutationFn: (name: string) => api.updateWorkflow(workflowId, { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow', workflowId] })
      queryClient.invalidateQueries({ queryKey: ['workflows'] })
    },
  })

  const save = () => {
    setEditing(false)
    const trimmed = value.trim()
    if (!trimmed || trimmed === initialValue) {
      setValue(initialValue)
      return
    }
    mutation.mutate(trimmed)
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setValue(initialValue); setEditing(false) } }}
        className="w-full rounded-md border border-border bg-transparent px-2 py-1 text-lg font-semibold outline-none focus:border-primary/50"
      />
    )
  }

  return (
    <h1
      onClick={() => setEditing(true)}
      className="cursor-text rounded-md px-2 py-1 text-lg font-semibold transition-colors hover:bg-muted/40"
      title="Click to edit"
    >
      {initialValue}
    </h1>
  )
}

function EditableDescription({ workflowId, initialValue }: { workflowId: string; initialValue: string }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(initialValue)
  const inputRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()

  useEffect(() => { setValue(initialValue) }, [initialValue])
  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])

  const mutation = useMutation({
    mutationFn: (description: string) => api.updateWorkflow(workflowId, { description: description || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow', workflowId] })
      queryClient.invalidateQueries({ queryKey: ['workflows'] })
    },
  })

  const save = () => {
    setEditing(false)
    if (value.trim() === initialValue) {
      setValue(initialValue)
      return
    }
    mutation.mutate(value.trim())
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setValue(initialValue); setEditing(false) } }}
        placeholder="Add a description..."
        className="mt-1 w-full rounded-md border border-border bg-transparent px-2 py-0.5 text-sm text-muted-foreground outline-none focus:border-primary/50"
      />
    )
  }

  return (
    <p
      onClick={() => setEditing(true)}
      className="mt-1 cursor-text rounded-md px-2 py-0.5 text-sm text-muted-foreground transition-colors hover:bg-muted/40"
      title="Click to edit"
    >
      {initialValue || <span className="italic text-muted-foreground/40">Add a description...</span>}
    </p>
  )
}

function DeployStatusBadge({
  hasActiveDeployment,
  hasUndeployedChanges,
  deployedVersion,
}: {
  hasActiveDeployment: boolean
  hasUndeployedChanges: boolean
  deployedVersion?: number
}) {
  if (!hasActiveDeployment) return null

  if (hasUndeployedChanges) {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-status-warning/10 px-1.5 py-0.5 text-[10px] font-medium text-status-warning">
        <span className="h-1.5 w-1.5 rounded-full bg-status-warning" />
        Deployed v{deployedVersion ?? '?'} (outdated)
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1 rounded bg-status-success/10 px-1.5 py-0.5 text-[10px] font-medium text-status-success">
      <span className="h-1.5 w-1.5 rounded-full bg-status-success" />
      Deployed v{deployedVersion ?? '?'}
    </span>
  )
}

function DeployStatusDot({ status }: { status: string }) {
  const color =
    status === 'success' ? 'bg-status-success' :
    status === 'failed' ? 'bg-status-error' :
    'bg-status-info animate-pulse'

  return <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
}
