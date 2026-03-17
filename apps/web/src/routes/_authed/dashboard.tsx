import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Plus, Loader2, Workflow, AlertTriangle, Activity } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { api } from '../../lib/api-client'
import { RunStatusBadge } from '../../components/monitoring/run-status-badge'
import { WorkflowActionsMenu } from '../../components/dashboard/workflow-actions-menu'
import { OnboardingWizard } from '../../components/onboarding/onboarding-wizard'
import { TriggerButton } from '../../components/dashboard/trigger-button'
import { useRefetchInterval } from '../../stores/polling-store'
import { useOnboardingStore } from '../../stores/onboarding-store'
import { useActiveRunSync } from '../../hooks/use-active-run-sync'

export const Route = createFileRoute('/_authed/dashboard')({
  component: DashboardPage,
})

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

function duration(start: string, end: string, status: string): string {
  if (['running', 'queued'].includes(status)) return '--'
  const ms = new Date(end).getTime() - new Date(start).getTime()
  if (ms < 1000) return `${ms}ms`
  const secs = Math.floor(ms / 1000)
  if (secs < 60) return `${secs}s`
  const mins = Math.floor(secs / 60)
  const remSecs = secs % 60
  return `${mins}m ${remSecs}s`
}

function DashboardPage() {
  const workflowsInterval = useRefetchInterval('workflows')
  const deploymentsInterval = useRefetchInterval('all-deployments')

  const { data: workflows, isLoading: wfLoading } = useQuery({
    queryKey: ['workflows'],
    queryFn: () => api.listWorkflows(),
    refetchInterval: workflowsInterval,
    retry: false,
  })

  const { data: connections } = useQuery({
    queryKey: ['connections'],
    queryFn: () => api.listConnections(),
    retry: false,
  })

  const { data: recentDeployments } = useQuery({
    queryKey: ['all-deployments'],
    queryFn: () => api.listAllDeployments(),
    refetchInterval: deploymentsInterval,
    retry: false,
  })

  const { data: recentRuns } = useQuery({
    queryKey: ['all-runs'],
    queryFn: () => api.listAllRuns(),
    retry: false,
  })

  useActiveRunSync(recentRuns, ['all-runs'])

  // Build deployment status map
  const latestDeployStatus = new Map<string, { status: string; createdAt: string; versionId: string }>()
  if (recentDeployments) {
    for (const d of recentDeployments) {
      if (!latestDeployStatus.has(d.workflowId)) {
        latestDeployStatus.set(d.workflowId, { status: d.status, createdAt: d.createdAt, versionId: d.versionId })
      }
    }
  }

  // Build latest run map per workflow
  const latestRunByWorkflow = new Map<string, { status: string; createdAt: string }>()
  if (recentRuns) {
    for (const r of recentRuns) {
      if (!latestRunByWorkflow.has(r.workflowId)) {
        latestRunByWorkflow.set(r.workflowId, { status: r.status, createdAt: r.createdAt })
      }
    }
  }

  // Stats
  const totalWorkflows = workflows?.length ?? 0
  const runningNow = recentRuns?.filter((r) => r.status === 'running' || r.status === 'queued').length ?? 0
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
  const errorsWeek = recentRuns?.filter(
    (r) => r.status === 'errored' && new Date(r.createdAt).getTime() > sevenDaysAgo,
  ).length ?? 0

  // Onboarding gate
  const onboardingSkipped = useOnboardingStore((s) => s.skipped)
  const isNewUser = !onboardingSkipped && (connections?.length ?? 0) === 0 && (workflows?.length ?? 0) === 0
    && connections !== undefined && workflows !== undefined

  if (isNewUser) {
    return <OnboardingWizard />
  }

  const workflowMap = new Map(workflows?.map((w) => [w.id, w]) ?? [])

  return (
    <div>
      <h1 className="border-b border-border pb-4 text-lg font-semibold">Dashboard</h1>

      <div className="mx-auto max-w-screen-md">
      {/* Stats */}
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <StatCard icon={Workflow} value={totalWorkflows} label="Workflows" loading={wfLoading} />
        <StatCard icon={Activity} value={runningNow} label="Running" loading={!recentRuns} />
        <StatCard icon={AlertTriangle} value={errorsWeek} label="Errors (7d)" loading={!recentRuns} variant={errorsWeek > 0 ? 'warning' : undefined} />
      </div>

      {/* Workflows Table */}
      <section className="mt-10">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Workflows</h2>
          <Link to="/workflows/$workflowId/canvas" params={{ workflowId: 'new' }} search={{ template: true }}>
            <Button size="sm" className="gap-1.5">
              <Plus className="h-4 w-4" />
              New Workflow
            </Button>
          </Link>
        </div>

        {wfLoading && (
          <div className="mt-4 flex justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/60" />
          </div>
        )}

        {workflows && workflows.length === 0 && !isNewUser && (
          <div className="mt-4 rounded-md border border-border px-4 py-8 text-center text-sm text-muted-foreground">
            No workflows yet.{' '}
            <Link to="/workflows/$workflowId/canvas" params={{ workflowId: 'new' }} className="text-primary hover:underline">
              Create one
            </Link>
          </div>
        )}

        {workflows && workflows.length > 0 && (
          <div className="mt-4 overflow-hidden border border-border">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/60">Name</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/60">Status</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/60">Last run</th>
                  <th className="w-12 px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {workflows.map((wf) => {
                  const deploy = latestDeployStatus.get(wf.id)
                  const lastRun = latestRunByWorkflow.get(wf.id)
                  return (
                    <tr key={wf.id} className="border-b border-border/50 last:border-0 transition-colors hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <Link
                          to="/workflows/$workflowId"
                          params={{ workflowId: wf.id }}
                          className="text-sm font-medium text-foreground hover:text-foreground"
                        >
                          {wf.name}
                        </Link>
                        {wf.description && (
                          <p className="mt-0.5 truncate text-xs text-muted-foreground/60 max-w-xs">{wf.description}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <WorkflowStatusBadge
                          hasVersion={!!wf.currentVersionId}
                          deployStatus={deploy?.status}
                          isOutdated={!!(deploy?.status === 'success' && wf.currentVersionId && deploy.versionId !== wf.currentVersionId)}
                        />
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {lastRun ? timeAgo(lastRun.createdAt) : '--'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {deploy?.status === 'success' && <TriggerButton workflowId={wf.id} />}
                          <WorkflowActionsMenu
                            workflow={wf}
                            isDeployed={deploy?.status === 'success'}
                          />
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Recent Runs */}
      {recentRuns && recentRuns.length > 0 && (
        <section className="mt-10">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Recent Runs</h2>
            <Link to="/runs">
              <Button variant="ghost" size="sm" className="text-xs">View all</Button>
            </Link>
          </div>
          <div className="mt-4 overflow-hidden border border-border">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/60">Workflow</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/60">Instance</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/60">Status</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/60">Duration</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/60">Started</th>
                </tr>
              </thead>
              <tbody>
                {recentRuns.slice(0, 8).map((run) => {
                  const wf = workflowMap.get(run.workflowId)
                  return (
                    <tr key={run.id} className="border-b border-border/50 last:border-0 transition-colors hover:bg-muted/30">
                      <td className="px-4 py-3">
                        {wf ? (
                          <Link
                            to="/workflows/$workflowId/runs"
                            params={{ workflowId: run.workflowId }}
                            className="text-sm text-foreground/70 hover:text-foreground"
                          >
                            {wf.name}
                          </Link>
                        ) : (
                          <span className="text-sm text-muted-foreground font-mono">{run.workflowId.slice(0, 8)}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          to="/runs/$runId"
                          params={{ runId: run.id }}
                          search={{ workflowId: run.workflowId }}
                          className="font-mono text-xs text-foreground/60 hover:text-foreground"
                        >
                          {run.instanceId}
                        </Link>
                      </td>
                      <td className="px-4 py-3"><RunStatusBadge status={run.status} /></td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{duration(run.createdAt, run.updatedAt, run.status)}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{timeAgo(run.createdAt)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
      </div>
    </div>
  )
}

function WorkflowStatusBadge({
  hasVersion,
  deployStatus,
  isOutdated,
}: {
  hasVersion: boolean
  deployStatus?: string
  isOutdated?: boolean
}) {
  if (deployStatus === 'deploying' || deployStatus === 'pending') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-status-info">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-status-info" />
        Deploying
      </span>
    )
  }

  if (hasVersion && deployStatus === 'success') {
    if (isOutdated) {
      return (
        <span className="inline-flex items-center gap-1 text-xs text-status-warning">
          <span className="h-1.5 w-1.5 rounded-full bg-status-warning" />
          Outdated
        </span>
      )
    }
    return (
      <span className="inline-flex items-center gap-1 text-xs text-status-success">
        <span className="h-1.5 w-1.5 rounded-full bg-status-success" />
        Deployed
      </span>
    )
  }

  if (deployStatus === 'failed') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-status-error">
        <span className="h-1.5 w-1.5 rounded-full bg-status-error" />
        Error
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground/60">
      <span className="h-1.5 w-1.5 rounded-full border border-border" />
      Draft
    </span>
  )
}

function StatCard({
  icon: Icon,
  value,
  label,
  loading,
  variant,
}: {
  icon: React.ComponentType<{ className?: string }>
  value: number
  label: string
  loading?: boolean
  variant?: 'warning'
}) {
  return (
    <div className="rounded-md border border-border bg-card px-4 py-3">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" />
        <span className="text-xs font-medium uppercase tracking-wider">{label}</span>
      </div>
      {loading ? (
        <Loader2 className="mt-2 h-5 w-5 animate-spin text-muted-foreground/60" />
      ) : (
        <span className={`mt-1 block text-xl font-semibold ${variant === 'warning' && value > 0 ? 'text-amber-400' : ''}`}>
          {value}
        </span>
      )}
    </div>
  )
}
