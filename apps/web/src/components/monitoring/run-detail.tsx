import { useEffect, useRef } from 'react'
import { Link } from '@tanstack/react-router'
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'
import { api } from '../../lib/api-client'
import { queries, flatPages } from '../../lib/queries'
import { durationCompact, formatDateTime } from '../../lib/time'
import { RunActions } from './run-actions'
import { RunErrorBlock } from './run-error-block'
import { RunStatusBadge } from './run-status-badge'

const TERMINAL_STATUSES = new Set(['complete', 'errored', 'terminated'])

interface RunDetailProps {
  runId: string
  /** Workflow id from the URL search param; resolved from the runs list when absent. */
  workflowIdHint?: string
}

export function RunDetail({ runId, workflowIdHint }: RunDetailProps) {
  const queryClient = useQueryClient()

  const { data: allRuns } = useInfiniteQuery({
    ...queries.runs.all(''),
    enabled: !workflowIdHint,
    retry: false,
    select: (data) => flatPages(data),
  })

  const workflowId = workflowIdHint || allRuns?.find((r) => r.id === runId)?.workflowId || ''

  const prevStatus = useRef<string | null>(null)

  const { data: run, isLoading } = useQuery({
    queryKey: ['workflow-run', workflowId, runId],
    queryFn: () => api.getWorkflowRun(workflowId, runId),
    enabled: !!workflowId,
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

  const { data: workflow } = useQuery({
    queryKey: ['workflow', workflowId],
    queryFn: () => api.getWorkflow(workflowId),
    enabled: !!workflowId,
  })

  const { data: connections } = useInfiniteQuery({
    ...queries.connections.list(''),
    retry: false,
    select: (data) => flatPages(data),
  })

  if (isLoading || !workflowId) {
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
  const connection = connections?.find((c) => c.id === run.connectionId)

  return (
    <div>
      <div className="-mx-6 flex h-16 shrink-0 items-center justify-between gap-4 border-b border-border px-6 md:-mx-8 md:px-8">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground/60">
            <Link to="/runs" className="transition-colors hover:text-muted-foreground">
              Runs
            </Link>
            <span className="text-muted-foreground/40">/</span>
          </span>
          {workflow && (
            <Link
              to="/workflows/$workflowId"
              params={{ workflowId }}
              className="truncate text-base font-semibold tracking-tight hover:text-foreground/80"
            >
              {workflow.name}
            </Link>
          )}
          <RunStatusBadge status={run.status} />
        </div>
        {!isTerminal && <RunActions workflowId={workflowId} runId={runId} status={run.status} />}
      </div>

      <div className="max-w-screen-md">
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
              <Link to="/connections" className="text-sm text-foreground/70 hover:text-foreground">
                {connection.name}
              </Link>
              <span className="ml-2 font-mono text-xs text-muted-foreground/60">
                {connection.credentials.accountId}
              </span>
            </Field>
          )}

          <Field label="Version">
            <span className="font-mono text-sm text-muted-foreground">{run.versionId}</span>
          </Field>
        </div>

        <div className="mt-4 text-xs text-muted-foreground/40">
          <span className="font-mono">{run.id}</span>
        </div>

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
