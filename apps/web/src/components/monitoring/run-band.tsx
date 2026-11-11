import { useState, type ReactNode } from 'react'
import { format, isToday } from 'date-fns'
import type { RunSummary } from '../../lib/api-client'
import { isTerminalRunStatus } from '../../lib/run-steps'
import { formatDurationMs } from '../../lib/time'
import { cn } from '../../lib/utils'
import { useElapsedSeconds } from '../../hooks/use-elapsed-seconds'
import type { RunConnection } from './run-connection'
import { RunPayloadDialog } from './run-payload-dialog'

const LABEL = 'text-[11.5px] font-medium uppercase tracking-wider text-muted-foreground'
const COLUMN = 'flex min-w-0 flex-col gap-1 px-4 py-3.5'

const TRIGGER_NAME: Record<string, string> = { dashboard: 'Dashboard', api: 'API key' }

interface RunBandProps {
  workflowId: string
  run: RunSummary
  connection: RunConnection | null
  /** Where it is or where it stopped, from its steps (a call: what it answered). */
  whereabouts: string
  /** A function's run is a call: its body, not a payload. */
  call?: boolean
}

/** The facts across the run page (26a): how long, when, what ran where, how it started. */
export function RunBand({ workflowId, run, connection, whereabouts, call = false }: RunBandProps) {
  const [payloadOpen, setPayloadOpen] = useState(false)
  const failed = run.status === 'errored'

  function handleShowPayload() {
    setPayloadOpen(true)
  }

  return (
    <section
      aria-label="Run facts"
      className="flex flex-wrap divide-border rounded-2xl border border-border bg-card md:flex-nowrap md:divide-x"
    >
      <div className={cn(COLUMN, 'basis-[220px] grow-[1.2]')}>
        <span className={LABEL}>{isTerminalRunStatus(run.status) ? 'Ran for' : 'Running for'}</span>
        <span
          className={cn(
            'font-mono text-[17px] font-semibold tabular-nums',
            failed ? 'text-status-error' : 'text-foreground',
          )}
        >
          <RunDuration run={run} />
        </span>
        <span className="truncate text-xs text-muted-foreground">{whereabouts}</span>
      </div>
      <Column label="Started" sub={startedDay(run.createdAt)}>
        <span className="font-mono tabular-nums">
          {format(new Date(run.createdAt), 'HH:mm:ss')}
        </span>
      </Column>
      <Column
        label="Version"
        sub={connection ? [connection.name, connection.account].filter(Boolean).join(' · ') : '—'}
      >
        {run.versionNumber != null ? `v${run.versionNumber}` : '—'}
      </Column>
      <div className={cn(COLUMN, 'basis-[200px] grow')}>
        <span className={LABEL}>Triggered by</span>
        <span className="text-[13.5px] text-foreground">
          {(run.trigger && TRIGGER_NAME[run.trigger]) ?? 'Not recorded'}
        </span>
        {run.hasParams && (
          <button
            type="button"
            onClick={handleShowPayload}
            className="self-start text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {call ? 'See the body →' : 'See the payload →'}
          </button>
        )}
      </div>
      {run.hasParams && (
        <RunPayloadDialog
          workflowId={workflowId}
          runId={run.id}
          open={payloadOpen}
          onOpenChange={setPayloadOpen}
        />
      )}
    </section>
  )
}

function Column({ label, sub, children }: { label: string; sub: ReactNode; children: ReactNode }) {
  return (
    <div className={cn(COLUMN, 'basis-[180px] grow')}>
      <span className={LABEL}>{label}</span>
      <span className="text-[13.5px] text-foreground">{children}</span>
      <span className="truncate text-xs text-muted-foreground">{sub}</span>
    </div>
  )
}

/** Live while it runs (a second's tick), else from its start to its last update. */
function RunDuration({ run }: { run: RunSummary }) {
  const startMs = new Date(run.createdAt).getTime()
  const live = !isTerminalRunStatus(run.status)
  const elapsed = useElapsedSeconds(live ? startMs : null)
  const ms =
    elapsed !== null
      ? elapsed * 1000
      : (run.durationMs ?? new Date(run.updatedAt).getTime() - startMs)
  return <>{formatDurationMs(ms)}</>
}

function startedDay(at: string): string {
  const day = new Date(at)
  return isToday(day) ? `Today, ${format(day, 'd MMM')}` : format(day, 'EEE, d MMM yyyy')
}
