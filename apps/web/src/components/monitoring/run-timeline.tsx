import { useMemo } from 'react'
import { AlertCircle, Clock, Moon, Radio, RotateCcw } from 'lucide-react'
import type { RunStep } from '../../lib/api-client'
import { parseRunError } from '../../lib/parse-run-error'
import { buildRunTimeline, type TimelineRow, type TimelineRunContext } from '../../lib/run-steps'
import { formatDurationMs } from '../../lib/time'
import { cn } from '../../lib/utils'

const KIND_ICON: Record<RunStep['kind'], typeof Clock> = {
  do: Clock,
  sleep: Moon,
  waitForEvent: Radio,
  rollback: RotateCcw,
}

const STATUS_BAR: Record<RunStep['status'], string> = {
  complete: 'bg-status-success/70',
  running: 'bg-status-info/70 animate-pulse',
  waiting: 'bg-status-warning/60 animate-pulse',
  errored: 'bg-status-error/70',
}

const STATUS_TEXT: Record<RunStep['status'], string> = {
  complete: 'text-status-success',
  running: 'text-status-info',
  waiting: 'text-status-warning',
  errored: 'text-status-error',
}

interface RunTimelineProps {
  steps: RunStep[]
  run: TimelineRunContext
  /** Node id → display name, for labels friendlier than the step label. */
  nodeNames?: Record<string, string>
}

/**
 * Per-step bars on one time axis: what ran, when, for how long, how many
 * attempts it took, and what the provider billed — the F8 telemetry made
 * visible.
 */
export function RunTimeline({ steps, run, nodeNames }: RunTimelineProps) {
  const timeline = useMemo(() => buildRunTimeline(steps, run), [steps, run])

  if (steps.length === 0) {
    return (
      <p className="text-xs text-muted-foreground/60">
        No steps yet. They appear as Cloudflare reports them.
      </p>
    )
  }

  return (
    <div className="rounded-md border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-xs font-medium text-foreground/60">Steps</span>
        <span className="text-xs text-muted-foreground/60">
          {timeline.billableSteps} billable step{timeline.billableSteps === 1 ? '' : 's'} ·{' '}
          {formatDurationMs(timeline.spanMs)}
        </span>
      </div>
      <ul>
        {timeline.rows.map((row) => (
          <TimelineRowView key={row.id} row={row} spanMs={timeline.spanMs} nodeNames={nodeNames} />
        ))}
      </ul>
    </div>
  )
}

function TimelineRowView({
  row,
  spanMs,
  nodeNames,
}: {
  row: TimelineRow
  spanMs: number
  nodeNames?: Record<string, string>
}) {
  const Icon = KIND_ICON[row.kind]
  const name = (row.nodeId && nodeNames?.[row.nodeId]) ?? row.label
  const left = (row.startOffsetMs / spanMs) * 100
  const width = Math.max((row.durationMs / spanMs) * 100, 0.75)
  const iconClass = row.interrupted ? 'text-muted-foreground/50' : STATUS_TEXT[row.status]
  const barClass = row.interrupted ? 'bg-muted-foreground/30' : STATUS_BAR[row.status]

  return (
    <li className="border-b border-border/50 px-3 py-1.5 last:border-b-0">
      <div className="flex items-center gap-2 text-xs">
        <Icon className={cn('h-3 w-3 shrink-0', iconClass)} />
        <span
          className="w-40 shrink-0 truncate text-foreground/80"
          title={row.interrupted ? `${row.label}: interrupted when the run ended` : row.label}
        >
          {name}
        </span>
        <div className="relative h-2 flex-1 overflow-hidden rounded bg-muted/40">
          <div
            className={cn('absolute top-0 h-full rounded', barClass)}
            style={{ left: `${left}%`, width: `${width}%` }}
          />
        </div>
        <span className="w-16 shrink-0 text-right font-mono tabular-nums text-muted-foreground/70">
          {formatDurationMs(row.durationMs)}
        </span>
        <span className="w-8 shrink-0 text-right font-mono tabular-nums text-muted-foreground/50">
          {row.attemptCount > 1 ? `×${row.attemptCount}` : ''}
        </span>
      </div>
      {row.error && (
        <div className="mt-1 flex items-start gap-1.5 pl-5 text-xs text-status-error/80">
          <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
          <span className="min-w-0 break-words">{formatStepError(row.error)}</span>
        </div>
      )}
    </li>
  )
}

function formatStepError(raw: string): string {
  const parsed = parseRunError(raw)
  return parsed.name ? `${parsed.name}: ${parsed.message}` : parsed.message
}
