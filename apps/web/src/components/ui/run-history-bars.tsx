import { cn } from '../../lib/utils'

export type RunOutcome = 'ok' | 'fail'

const SLOTS = 10

interface RunHistoryBarsProps {
  /** Oldest first; only the last ten are drawn. */
  runs: RunOutcome[]
}

function describeRuns(runs: RunOutcome[]): string {
  if (runs.length === 0) return 'No runs yet'
  const ok = runs.filter((run) => run === 'ok').length
  const failed = runs.length - ok
  const parts = [ok > 0 && `${ok} succeeded`, failed > 0 && `${failed} failed`].filter(Boolean)
  return `Last ${runs.length} ${runs.length === 1 ? 'run' : 'runs'}: ${parts.join(', ')}`
}

/**
 * The last ten runs as bars, newest on the right. Failures are taller as well
 * as red, so they stand out without relying on colour.
 */
export function RunHistoryBars({ runs }: RunHistoryBarsProps) {
  const recent = runs.slice(-SLOTS)
  const slots: (RunOutcome | null)[] = [...Array<null>(SLOTS - recent.length).fill(null), ...recent]
  return (
    <span
      role="img"
      aria-label={describeRuns(recent)}
      className="flex h-[18px] w-full items-end gap-[3px]"
    >
      {slots.map((slot, i) => (
        <span
          key={i}
          className={cn(
            'flex-1 rounded-[2px]',
            slot === 'ok' && 'h-3 bg-status-success',
            slot === 'fail' && 'h-[18px] bg-status-error',
            slot === null && 'h-1.5 bg-muted',
          )}
        />
      ))}
    </span>
  )
}
