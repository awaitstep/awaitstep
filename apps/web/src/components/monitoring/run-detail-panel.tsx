import { useState } from 'react'
import {
  Clock,
  AlertCircle,
  CheckCircle2,
  Pause,
  Play,
  Square,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
} from 'lucide-react'
import { Button } from '../ui/button'
import { formatDate } from '../../lib/time'
import { copyToClipboard } from '../../lib/utils'
import { RunStatusBadge } from './run-status-badge'

interface RunDetailPanelProps {
  run: {
    id: string
    instanceId: string
    status: string
    output?: string
    error?: string
    createdAt: string
  }
  onPause?: () => void
  onResume?: () => void
  onTerminate?: () => void
}

const TERMINAL_STATUSES = new Set(['complete', 'errored', 'terminated'])

interface ParsedError {
  name?: string
  message: string
  stack?: string
  raw: string
}

function parseError(error: unknown): ParsedError {
  if (typeof error === 'string') {
    try {
      const parsed = JSON.parse(error)
      if (typeof parsed === 'object' && parsed !== null) {
        return parseError(parsed)
      }
    } catch {
      // not JSON — treat as plain message
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

function ErrorDisplay({ error }: { error: unknown }) {
  const [showRaw, setShowRaw] = useState(false)
  const [copied, setCopied] = useState(false)
  const parsed = parseError(error)

  const handleCopy = () => {
    copyToClipboard(parsed.raw)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-2">
      <div className="rounded-lg border border-status-error/10 bg-status-error/5 p-3">
        {parsed.name && (
          <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-status-error/60">
            {parsed.name}
          </div>
        )}
        <p className="text-xs text-status-error">{parsed.message}</p>
        {parsed.stack && (
          <pre className="mt-2 overflow-auto text-xs leading-relaxed text-status-error/60">
            {parsed.stack}
          </pre>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => setShowRaw(!showRaw)}
          className="flex items-center gap-1 text-xs text-muted-foreground/60 hover:text-muted-foreground"
        >
          {showRaw ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          Raw error
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
        <pre className="overflow-auto rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground font-mono">
          {parsed.raw}
        </pre>
      )}
    </div>
  )
}

export function RunDetailPanel({ run, onPause, onResume, onTerminate }: RunDetailPanelProps) {
  const isTerminal = TERMINAL_STATUSES.has(run.status)
  const isPaused = run.status === 'paused'

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <RunStatusBadge status={run.status} />
          <span className="text-xs text-muted-foreground/60 font-mono">{run.instanceId}</span>
        </div>
        {!isTerminal && (
          <div className="flex items-center gap-1">
            {isPaused ? (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground"
                onClick={onResume}
              >
                <Play className="h-3.5 w-3.5" />
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground"
                onClick={onPause}
              >
                <Pause className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive hover:text-destructive/80"
              onClick={onTerminate}
            >
              <Square className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Clock className="h-3 w-3" />
        <span>Started {formatDate(run.createdAt)}</span>
      </div>

      {run.output && (
        <div className="space-y-1">
          <div className="flex items-center gap-1 text-xs text-status-success/80">
            <CheckCircle2 className="h-3 w-3" />
            <span>Output</span>
          </div>
          <pre className="overflow-auto rounded-lg bg-muted/40 p-3 text-xs text-foreground/70 font-mono border border-border">
            {typeof run.output === 'string' ? run.output : JSON.stringify(run.output, null, 2)}
          </pre>
        </div>
      )}

      {run.error && (
        <div className="space-y-1">
          <div className="flex items-center gap-1 text-xs text-status-error/80">
            <AlertCircle className="h-3 w-3" />
            <span>Error</span>
          </div>
          <ErrorDisplay error={run.error} />
        </div>
      )}
    </div>
  )
}
