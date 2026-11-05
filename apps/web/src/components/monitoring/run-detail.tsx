import { useEffect, useRef } from 'react'
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'
import { flatPages } from '../../lib/queries'
import { durationCompact, formatDateTime } from '../../lib/time'
import { RunActions } from './run-actions'
import { runConnection } from './run-connection'
import { RunErrorBlock } from './run-error-block'
import { RunStatusBadge } from './run-status-badge'
import { RunTelemetry } from './run-telemetry'
import { useApi, useQueries } from '../../contexts/api-client-context'

const TERMINAL_STATUSES = new Set(['complete', 'errored', 'terminated'])

interface RunDetailProps {
  runId: string
  workflowId: string
}

/** One run, on its workflow's Runs page in a workspace; the frame's breadcrumb names the workflow. */
export function RunDetail({ runId, workflowId }: RunDetailProps) {
  const api = useApi()
  const queries = useQueries()
  const queryClient = useQueryClient()
  const prevStatus = useRef<string | null>(null)

  const { data: run, isLoading } = useQuery({
    queryKey: ['workflow-run', workflowId, runId],
    queryFn: () => api.getWorkflowRun(workflowId, runId),
    refetchInterval: (query) => {
      const data = query.state.data
      return data && !TERMINAL_STATUSES.has(data.status) ? 5_000 : false
    },
  })

  // Refresh run lists once this run transitions into a terminal state.
  useEffect(() => {
    if (!run) return
    const wasActive = prevStatus.current && !TERMINAL_STATUSES.has(prevStatus.current)
    if (wasActive && TERMINAL_STATUSES.has(run.status)) {
      queryClient.invalidateQueries({ queryKey: ['all-runs'] })
      queryClient.invalidateQueries({ queryKey: ['workflow-runs', workflowId] })
    }
    prevStatus.current = run.status
  }, [run, queryClient, workflowId])

  // Keyed by the org this client calls, so another org's list never stands in.
  const { organizationId } = api.scope()
  const { data: connections } = useInfiniteQuery({
    ...queries.connections.list(organizationId ?? ''),
    retry: false,
    select: (data) => flatPages(data),
  })
  // A project's own accounts aren't in the org's list.
  const { data: deployConnections } = useQuery({
    ...queries.connections.forDeploy(workflowId),
    retry: false,
  })

  if (isLoading) {
    return (
      <div className="mt-12 flex justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/60" />
      </div>
    )
  }

  if (!run) {
    return <div className="mt-12 text-center text-sm text-muted-foreground">Run not found</div>
  }

  const isTerminal = TERMINAL_STATUSES.has(run.status)
  const isRunning = run.status === 'running' || run.status === 'queued'
  const connection = runConnection(run.connectionId, connections, deployConnections)

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex min-w-0 items-center gap-2">
        {/* The workflow's name is the page's heading; the run is a section of it. */}
        <h2 className="truncate font-mono text-xl font-semibold tracking-tight">
          {run.instanceId}
        </h2>
        <RunStatusBadge status={run.status} />
      </div>
      {!isTerminal && <RunActions workflowId={workflowId} runId={runId} status={run.status} />}
    </div>
  )

  return (
    <div>
      {header}

      <div className="max-w-screen-xl">
        <div className="mt-6 grid gap-x-12 gap-y-5 sm:grid-cols-2">
          <Field label="Instance ID">
            <span className="font-mono text-sm text-foreground">{run.instanceId}</span>
          </Field>

          <Field label="Duration">
            {isRunning ? (
              <span className="flex items-center gap-1.5 text-sm text-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground/60" />
                Running...
              </span>
            ) : (
              <span className="font-mono text-sm tabular-nums text-foreground">
                {durationCompact(run.createdAt, run.updatedAt)}
              </span>
            )}
          </Field>

          <Field label="Started">
            <span className="font-mono text-sm tabular-nums text-foreground/70">
              {formatDateTime(run.createdAt)}
            </span>
          </Field>

          {isTerminal && (
            <Field label="Ended">
              <span className="font-mono text-sm tabular-nums text-foreground/70">
                {formatDateTime(run.updatedAt)}
              </span>
            </Field>
          )}

          {connection && (
            <Field label="Connection">
              {/* The run's account may be the org's or the project's: named, not linked. */}
              <span className="text-sm text-foreground/70">{connection.name}</span>
              {connection.account && (
                <span className="ml-2 font-mono text-xs text-muted-foreground/60">
                  {connection.account}
                </span>
              )}
            </Field>
          )}

          <Field label="Version">
            <span className="font-mono text-sm text-muted-foreground">{run.versionId}</span>
          </Field>
        </div>

        <div className="mt-4 text-xs text-muted-foreground/40">
          <span className="font-mono">{run.id}</span>
        </div>

        <RunTelemetry workflowId={workflowId} run={run} />

        {run.output && (
          <div className="mt-8">
            <h3 className="mb-3 flex items-center gap-1.5 text-sm font-medium text-status-success">
              <CheckCircle2 className="h-4 w-4" />
              Output
            </h3>
            <pre className="overflow-auto rounded-md border border-border bg-card p-4 font-mono text-sm leading-relaxed text-foreground/70">
              {typeof run.output === 'string' ? run.output : JSON.stringify(run.output, null, 2)}
            </pre>
          </div>
        )}

        {run.error && (
          <div className="mt-8">
            <h3 className="mb-3 flex items-center gap-1.5 text-sm font-medium text-status-error">
              <AlertCircle className="h-4 w-4" />
              Error
            </h3>
            <RunErrorBlock error={run.error} />
          </div>
        )}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-2xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div>{children}</div>
    </div>
  )
}
