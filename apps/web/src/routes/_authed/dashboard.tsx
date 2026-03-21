import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Plus, Loader2, Workflow, AlertTriangle, Activity } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { api } from '../../lib/api-client'
import { RunStatusBadge } from '../../components/monitoring/run-status-badge'
import { RunDetailSheet } from '../../components/monitoring/run-detail-sheet'
import { WorkflowActionsMenu } from '../../components/dashboard/workflow-actions-menu'
import { OnboardingWizard } from '../../components/onboarding/onboarding-wizard'
import { TriggerButton } from '../../components/dashboard/trigger-button'
import { useRefetchInterval } from '../../stores/polling-store'
import { useOnboardingStore } from '../../stores/onboarding-store'
import { useSheetStore } from '../../stores/sheet-store'
import { useActiveRunSync } from '../../hooks/use-active-run-sync'
import { timeAgo, duration } from '../../lib/time'

export const Route = createFileRoute('/_authed/dashboard')({
  component: DashboardPage,
})

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

  const openRunSheet = useSheetStore((s) => s.openRunSheet)

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

      <div>
      {/* Stats */}
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <StatCard icon={Workflow} value={totalWorkflows} label="Workflows" loading={wfLoading} />
        <StatCard icon={Activity} value={runningNow} label="Running" loading={!recentRuns} />
        <StatCard icon={AlertTriangle} value={errorsWeek} label="Errors (7d)" loading={!recentRuns} variant={errorsWeek > 0 ? 'warning' : undefined} />
      </div>

      {/* Workflows */}
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
          <div className="mt-4 space-y-2">
            {workflows.map((wf) => {
              const deploy = latestDeployStatus.get(wf.id)
              const lastRun = latestRunByWorkflow.get(wf.id)
              return (
                <div
                  key={wf.id}
                  className="group rounded-lg border border-border bg-card transition-colors hover:border-border/80 hover:bg-muted/20"
                >
                  <div className="flex items-center justify-between px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2.5">
                        <Link
                          to="/workflows/$workflowId"
                          params={{ workflowId: wf.id }}
                          className="text-sm font-medium text-foreground hover:text-foreground"
                        >
                          {wf.name}
                        </Link>
                        <WorkflowStatusBadge
                          hasVersion={!!wf.currentVersionId}
                          deployStatus={deploy?.status}
                          isOutdated={!!(deploy?.status === 'success' && wf.currentVersionId && deploy.versionId !== wf.currentVersionId)}
                        />
                      </div>
                      {wf.description && (
                        <p className="mt-0.5 truncate text-xs text-muted-foreground/60 max-w-sm">{wf.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      {lastRun && (
                        <span className="text-xs text-muted-foreground/60">
                          {timeAgo(lastRun.createdAt)}
                        </span>
                      )}
                      <div className="flex items-center gap-1">
                        {deploy?.status === 'success' && <TriggerButton workflowId={wf.id} />}
                        <WorkflowActionsMenu
                          workflow={wf}
                          isDeployed={deploy?.status === 'success'}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
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
          <div className="mt-4 space-y-2">
            {recentRuns.slice(0, 8).map((run) => {
              const wf = workflowMap.get(run.workflowId)
              return (
                <button
                  key={run.id}
                  onClick={() => openRunSheet({ runId: run.id, workflowId: run.workflowId, workflowName: wf?.name })}
                  className="flex w-full items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-left transition-colors hover:border-border/80 hover:bg-muted/20"
                >
                  <div className="flex items-center gap-3">
                    <RunStatusBadge status={run.status} />
                    <div className="min-w-0">
                      <span className="text-sm text-foreground/70">
                        {wf?.name ?? run.workflowId.slice(0, 8)}
                      </span>
                      <span className="ml-2 font-mono text-xs text-muted-foreground/50">
                        {run.instanceId.slice(0, 12)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="font-mono">{duration(run.createdAt, run.updatedAt, run.status)}</span>
                    <span>{timeAgo(run.createdAt)}</span>
                  </div>
                </button>
              )
            })}
          </div>
        </section>
      )}

      <RunDetailSheet />
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
