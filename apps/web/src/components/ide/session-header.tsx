import { useMemo } from 'react'
import { Loader2, Play, Square } from 'lucide-react'
import type { TestSessionState } from '../../hooks/use-test-session'
import { useElapsedSeconds } from '../../hooks/use-elapsed-seconds'
import {
  formatClock,
  runAction,
  sessionSummary,
  startPhase,
  startPhaseLabel,
} from '../../lib/ide/session-log'
import { cn } from '../../lib/utils'
import { Button } from '../ui/button'

const DOT: Record<string, string> = {
  running: 'bg-status-success',
  starting: 'bg-status-warning',
  failed: 'bg-status-error',
}

/**
 * Start, Stop or Cancel, and the one line saying where the session is and
 * which code it runs. While it starts, the steps the browser can actually see
 * and how long they have taken — no percentages, nothing invented.
 */
export function SessionHeader({ state }: { state: TestSessionState }) {
  const { session, starting, stopping, stale, streamError, startRequestedAt } = state
  const action = runAction(session, { starting, stopping })
  const phase = startPhase(session, { starting })
  // One value per start, not one per render: a new number every render would
  // restart the ticking timer each time. A client clock behind the server's
  // reads as zero seconds, never negative.
  const since = useMemo(
    () => (phase ? (startRequestedAt ?? parseTime(session?.createdAt)) : null),
    [phase, startRequestedAt, session?.createdAt],
  )
  const elapsed = useElapsedSeconds(since)

  function handleAction() {
    if (action.kind === 'start') void state.start()
    if (action.kind === 'stop' || action.kind === 'cancel') void state.stop()
  }

  const summary = phase
    ? startPhaseLabel(phase, session?.runtime ?? null)
    : sessionSummary(session, { stale: stale.version, streamError })
  const warn = !phase && Boolean(streamError || stale.version)
  const scope = state.viewingOlder
    ? 'Sessions run the latest version, not the one you’re viewing. Nothing is deployed.'
    : session?.status === 'running'
      ? `Runs your saved files as of ${formatClock(session.createdAt)}. Nothing is deployed.`
      : 'Runs your saved files, not unsaved edits. Nothing is deployed.'

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <Button
        size="sm"
        variant={action.kind === 'start' ? 'default' : 'outline'}
        disabled={action.kind === 'busy'}
        onClick={handleAction}
      >
        {action.kind === 'stop' || action.kind === 'cancel' ? (
          <Square className="h-3.5 w-3.5" />
        ) : action.kind === 'busy' ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Play className="h-3.5 w-3.5" />
        )}
        {action.label}
      </Button>
      <span
        className={cn(
          'flex items-center gap-1.5 text-xs',
          warn ? 'text-status-warning' : 'text-foreground',
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            'h-1.5 w-1.5 rounded-full',
            phase
              ? 'animate-pulse bg-status-warning'
              : (DOT[session?.status ?? ''] ?? 'bg-muted-foreground'),
          )}
        />
        {/* The live region holds the state alone: a ticking number inside it is announced every second. */}
        <span role="status">{summary}</span>
        {elapsed !== null && (
          <span aria-hidden="true" className="tabular-nums text-muted-foreground">
            {elapsed}s
          </span>
        )}
      </span>
      <span className="text-2xs text-muted-foreground">{scope}</span>
    </div>
  )
}

function parseTime(iso: string | undefined): number | null {
  const time = iso ? Date.parse(iso) : Number.NaN
  return Number.isNaN(time) ? null : time
}
