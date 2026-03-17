import { createFileRoute, useParams, useSearch, Link, useRouter } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useRef, useEffect } from 'react'
import {
  Loader2, AlertCircle, CheckCircle2, Pause, Play, Square,
  ChevronDown, ChevronRight, Copy, Check, ArrowLeft,
} from 'lucide-react'
import { Button } from '../../components/ui/button'
import { RunStatusBadge } from '../../components/monitoring/run-status-badge'
import { api } from '../../lib/api-client'

export const Route = createFileRoute('/_authed/runs/$runId')({
  validateSearch: (search: Record<string, unknown>) => ({
    workflowId: typeof search.workflowId === 'string' ? search.workflowId : '',
  }),
  component: RunDetailPage,
})

const TERMINAL_STATUSES = new Set(['complete', 'errored', 'terminated'])

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

function duration(start: string, end: string): string {
  const ms = new Date(end).getTime() - new Date(start).getTime()
  if (ms < 1000) return `${ms}ms`
  const secs = Math.floor(ms / 1000)
  if (secs < 60) return `${secs}s`
  const mins = Math.floor(secs / 60)
  const remSecs = secs % 60
  if (mins < 60) return `${mins}m ${remSecs}s`
  const hrs = Math.floor(mins / 60)
  const remMins = mins % 60
  return `${hrs}h ${remMins}m`
}

function RunDetailPage() {
  const { runId } = useParams({ from: '/_authed/runs/$runId' })
  const { workflowId: searchWorkflowId } = useSearch({ from: '/_authed/runs/$runId' })
  const router = useRouter()
  const queryClient = useQueryClient()

  // Look up workflowId from search param or from cached runs list
  const { data: allRuns } = useQuery({
    queryKey: ['all-runs'],
    queryFn: () => api.listAllRuns(),
    enabled: !searchWorkflowId,
    retry: false,
  })

  const workflowId = searchWorkflowId || allRuns?.find((r) => r.id === runId)?.workflowId || ''

  const prevStatus = useRef<string | null>(null)

  const { data: run, isLoading } = useQuery({
    queryKey: ['workflow-run', workflowId, runId],
    queryFn: () =>
      fetch(`/api/workflows/${workflowId}/runs/${runId}`, { credentials: 'include' }).then((r) => r.json()),
    enabled: !!workflowId,
    refetchInterval: (query) => {
      const data = query.state.data
      return data && !TERMINAL_STATUSES.has(data.status) ? 5_000 : false
    },
  })

  // Invalidate run lists when this run reaches terminal state
  useEffect(() => {
    if (!run) return
    const wasActive = prevStatus.current && !TERMINAL_STATUSES.has(prevStatus.current)
    const isNowTerminal = TERMINAL_STATUSES.has(run.status)
    if (wasActive && isNowTerminal) {
      queryClient.invalidateQueries({ queryKey: ['all-runs'] })
      queryClient.invalidateQueries({ queryKey: ['workflow-runs', workflowId] })
    }
    prevStatus.current = run.status
  }, [run?.status, queryClient, workflowId])

  const { data: workflow } = useQuery({
    queryKey: ['workflow', workflowId],
    queryFn: () => api.getWorkflow(workflowId),
    enabled: !!workflowId,
  })

  const { data: connections } = useQuery({
    queryKey: ['connections'],
    queryFn: () => api.listConnections(),
    retry: false,
  })

  const actionMutation = useMutation({
    mutationFn: (action: 'pause' | 'resume' | 'terminate') =>
      fetch(`/api/workflows/${workflowId}/runs/${runId}/${action}`, {
        method: 'POST',
        credentials: 'include',
      }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow-run', workflowId, runId] })
      queryClient.invalidateQueries({ queryKey: ['workflow-runs', workflowId] })
      queryClient.invalidateQueries({ queryKey: ['all-runs'] })
    },
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
  const isPaused = run.status === 'paused'
  const isRunning = run.status === 'running' || run.status === 'queued'
  const connection = connections?.find((c) => c.id === run.connectionId)

  return (
    <div>
      {/* Back + Header */}
      <button onClick={() => router.history.back()} className="mb-4 inline-flex items-center gap-1.5 text-xs text-muted-foreground/60 hover:text-muted-foreground">
        <ArrowLeft className="h-3 w-3" />
        Back
      </button>
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <RunStatusBadge status={run.status} />
          {workflow && (
            <Link to="/workflows/$workflowId" params={{ workflowId }} className="text-sm text-muted-foreground hover:text-foreground/70">
              {workflow.name}
            </Link>
          )}
        </div>
        {!isTerminal && (
          <div className="flex items-center gap-1">
            {isPaused ? (
              <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={() => actionMutation.mutate('resume')}>
                <Play className="h-3.5 w-3.5" /> Resume
              </Button>
            ) : (
              <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={() => actionMutation.mutate('pause')}>
                <Pause className="h-3.5 w-3.5" /> Pause
              </Button>
            )}
            <Button variant="ghost" size="sm" className="gap-1.5 text-status-error/60 hover:text-status-error" onClick={() => actionMutation.mutate('terminate')}>
              <Square className="h-3.5 w-3.5" /> Terminate
            </Button>
          </div>
        )}
      </div>

      <div className="mx-auto max-w-screen-md">
      {/* Details */}
      <div className="mt-8 grid gap-x-12 gap-y-6 sm:grid-cols-2">
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
            <span className="font-mono text-sm text-foreground">{duration(run.createdAt, run.updatedAt)}</span>
          )}
        </Field>

        <Field label="Started">
          <span className="text-sm text-foreground/70">{formatDate(run.createdAt)}</span>
        </Field>

        {isTerminal && (
          <Field label="Ended">
            <span className="text-sm text-foreground/70">{formatDate(run.updatedAt)}</span>
          </Field>
        )}

        {connection && (
          <Field label="Connection">
            <Link to="/connections" className="text-sm text-foreground/70 hover:text-foreground">
              {connection.name}
            </Link>
            <span className="ml-2 font-mono text-xs text-muted-foreground/60">{connection.credentials.accountId}</span>
          </Field>
        )}

        <Field label="Version">
          <span className="font-mono text-sm text-muted-foreground">{run.versionId}</span>
        </Field>
      </div>

      <div className="mt-4 text-xs text-muted-foreground/40">
        <span className="font-mono">{run.id}</span>
      </div>

      {/* Output */}
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

      {/* Error */}
      {run.error && (
        <div className="mt-8">
          <h3 className="mb-3 flex items-center gap-1.5 text-sm font-medium text-status-error">
            <AlertCircle className="h-4 w-4" />
            Error
          </h3>
          <ErrorBlock error={run.error} />
        </div>
      )}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-xs text-muted-foreground">{label}</div>
      <div>{children}</div>
    </div>
  )
}

function ErrorBlock({ error }: { error: unknown }) {
  const [showRaw, setShowRaw] = useState(false)
  const [copied, setCopied] = useState(false)
  const parsed = parseError(error)

  const handleCopy = () => {
    navigator.clipboard.writeText(parsed.raw)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div>
      <div className="rounded-md border border-red-500/10 bg-red-500/5 p-4">
        {parsed.name && (
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-status-error/60">{parsed.name}</div>
        )}
        <p className="text-sm leading-relaxed text-red-300">{parsed.message}</p>
        {parsed.stack && (
          <pre className="mt-3 overflow-auto text-xs leading-relaxed text-red-300/50">{parsed.stack}</pre>
        )}
      </div>
      <div className="mt-2 flex items-center gap-3">
        <button onClick={() => setShowRaw(!showRaw)} className="flex items-center gap-1 text-xs text-muted-foreground/60 hover:text-muted-foreground">
          {showRaw ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          Raw
        </button>
        <button onClick={handleCopy} className="flex items-center gap-1 text-xs text-muted-foreground/60 hover:text-muted-foreground">
          {copied ? <Check className="h-3 w-3 text-status-success" /> : <Copy className="h-3 w-3" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      {showRaw && (
        <pre className="mt-2 overflow-auto rounded-md border border-border bg-card p-4 font-mono text-xs leading-relaxed text-muted-foreground">
          {parsed.raw}
        </pre>
      )}
    </div>
  )
}

function parseError(error: unknown): { name?: string; message: string; stack?: string; raw: string } {
  if (typeof error === 'string') {
    try {
      const parsed = JSON.parse(error)
      if (typeof parsed === 'object' && parsed !== null) return parseError(parsed)
    } catch { /* plain string */ }
    return { message: error, raw: error }
  }
  if (typeof error === 'object' && error !== null) {
    const obj = error as Record<string, unknown>
    const raw = JSON.stringify(error, null, 2)
    return {
      name: typeof obj.name === 'string' ? obj.name : undefined,
      message: typeof obj.message === 'string' ? obj.message : raw,
      stack: typeof obj.stack === 'string' ? obj.stack : undefined,
      raw,
    }
  }
  return { message: String(error), raw: String(error) }
}
