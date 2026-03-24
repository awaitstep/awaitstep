import { useEffect, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import * as Dialog from '@radix-ui/react-dialog'
import {
  Loader2,
  AlertCircle,
  CheckCircle2,
  Pause,
  Play,
  Square,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  X,
} from 'lucide-react'
import { Button } from '../ui/button'
import { api } from '../../lib/api-client'
import { useSheetStore } from '../../stores/sheet-store'
import { RunStatusBadge } from './run-status-badge'
import { formatDate } from '../../lib/time'

const TERMINAL_STATUSES = new Set(['complete', 'errored', 'terminated'])

export function RunDetailSheet() {
  const runSheet = useSheetStore((s) => s.runSheet)
  const closeRunSheet = useSheetStore((s) => s.closeRunSheet)

  function handleOpenChange(open: boolean) {
    if (!open) closeRunSheet()
  }

  return (
    <Dialog.Root open={!!runSheet} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
        <Dialog.Content className="fixed right-0 top-0 bottom-0 z-50 flex w-full max-w-md flex-col border-l border-border bg-background shadow-lg data-[state=open]:animate-in data-[state=open]:slide-in-from-right data-[state=open]:duration-200 data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=closed]:duration-150">
          <div className="flex items-center justify-between border-b border-border px-6 py-[1.125rem]">
            <Dialog.Title className="text-lg font-semibold">Run Details</Dialog.Title>
            <Dialog.Close className="rounded-md p-1 text-muted-foreground/60 transition-colors hover:bg-muted/60 hover:text-foreground/60">
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>
          {runSheet && (
            <RunDetailContent
              runId={runSheet.runId}
              workflowId={runSheet.workflowId}
              workflowName={runSheet.workflowName}
            />
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function RunDetailContent({
  runId,
  workflowId,
  workflowName,
}: {
  runId: string
  workflowId: string
  workflowName?: string
}) {
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

  const actionMutation = useMutation({
    mutationFn: (action: 'pause' | 'resume' | 'terminate') =>
      api.controlWorkflowRun(workflowId, runId, action),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow-run', workflowId, runId] })
      queryClient.invalidateQueries({ queryKey: ['workflow-runs', workflowId] })
      queryClient.invalidateQueries({ queryKey: ['all-runs'] })
    },
  })

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/60" />
      </div>
    )
  }

  if (!run) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Run not found
      </div>
    )
  }

  const isTerminal = TERMINAL_STATUSES.has(run.status)
  const isPaused = run.status === 'paused'
  const isRunning = run.status === 'running' || run.status === 'queued'

  function runDuration(start: string, end: string): string {
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

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6">
      {/* Status + Actions */}
      <div className="flex items-center justify-between">
        <RunStatusBadge status={run.status} />
        {!isTerminal && (
          <div className="flex items-center gap-1">
            {isPaused ? (
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-muted-foreground"
                onClick={() => actionMutation.mutate('resume')}
              >
                <Play className="h-3.5 w-3.5" /> Resume
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-muted-foreground"
                onClick={() => actionMutation.mutate('pause')}
              >
                <Pause className="h-3.5 w-3.5" /> Pause
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-status-error/60 hover:text-status-error"
              onClick={() => actionMutation.mutate('terminate')}
            >
              <Square className="h-3.5 w-3.5" /> Terminate
            </Button>
          </div>
        )}
      </div>

      {/* Fields */}
      <div className="mt-8 grid gap-y-6">
        {workflowName && (
          <Field label="Workflow">
            <Link
              to="/workflows/$workflowId"
              params={{ workflowId }}
              className="text-sm text-foreground/70 hover:text-foreground"
            >
              {workflowName}
            </Link>
          </Field>
        )}

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
            <span className="font-mono text-sm text-foreground">
              {runDuration(run.createdAt, run.updatedAt)}
            </span>
          )}
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Started">
            <span className="text-sm text-foreground/70">{formatDate(run.createdAt)}</span>
          </Field>
          {isTerminal && (
            <Field label="Ended">
              <span className="text-sm text-foreground/70">{formatDate(run.updatedAt)}</span>
            </Field>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Version">
            <span className="font-mono text-xs text-muted-foreground">{run.versionId}</span>
          </Field>
          <Field label="Run ID">
            <span className="font-mono text-xs text-muted-foreground/60">{run.id}</span>
          </Field>
        </div>
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
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-status-error/60">
            {parsed.name}
          </div>
        )}
        <p className="text-sm leading-relaxed text-red-300">{parsed.message}</p>
        {parsed.stack && (
          <pre className="mt-3 overflow-auto text-xs leading-relaxed text-red-300/50">
            {parsed.stack}
          </pre>
        )}
      </div>
      <div className="mt-2 flex items-center gap-3">
        <button
          onClick={() => setShowRaw(!showRaw)}
          className="flex items-center gap-1 text-xs text-muted-foreground/60 hover:text-muted-foreground"
        >
          {showRaw ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          Raw
        </button>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-xs text-muted-foreground/60 hover:text-muted-foreground"
        >
          {copied ? (
            <Check className="h-3 w-3 text-status-success" />
          ) : (
            <Copy className="h-3 w-3" />
          )}
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

function parseError(error: unknown): {
  name?: string
  message: string
  stack?: string
  raw: string
} {
  if (typeof error === 'string') {
    try {
      const parsed = JSON.parse(error)
      if (typeof parsed === 'object' && parsed !== null) return parseError(parsed)
    } catch {
      /* plain string */
    }
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
