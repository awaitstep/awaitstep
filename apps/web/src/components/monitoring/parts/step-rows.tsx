import { Check, ChevronRight, Loader2, X } from 'lucide-react'
import type { StepGroup, StepItem, StepRowState } from '../../../lib/run-step-list'
import { parseRunError } from '../../../lib/parse-run-error'
import { formatDurationMs } from '../../../lib/time'
import { cn } from '../../../lib/utils'

const BAR: Record<StepRowState, string> = {
  done: 'bg-status-success',
  failed: 'bg-status-error',
  waiting: 'bg-status-info animate-pulse',
  running: 'bg-status-warning animate-pulse',
  timedOut: 'bg-status-warning',
  interrupted: 'bg-muted-foreground/40',
}

/** The selected row's left accent, in its state's colour. */
const ACCENT: Record<StepRowState, string> = {
  done: 'shadow-[inset_2px_0_0_var(--color-status-success)]',
  failed: 'shadow-[inset_2px_0_0_var(--color-status-error)]',
  waiting: 'shadow-[inset_2px_0_0_var(--color-status-info)]',
  running: 'shadow-[inset_2px_0_0_var(--color-status-warning)]',
  timedOut: 'shadow-[inset_2px_0_0_var(--color-status-warning)]',
  interrupted: 'shadow-[inset_2px_0_0_var(--color-muted-foreground)]',
}

export function stepRowDomId(stepId: string): string {
  return `run-step-${stepId}`
}

export function StateMark({ state }: { state: StepRowState }) {
  const base = 'flex size-[18px] shrink-0 items-center justify-center rounded-full'
  if (state === 'done') {
    return (
      <span className={cn(base, 'bg-status-success/15 text-status-success')}>
        <Check aria-hidden="true" className="size-3" strokeWidth={3} />
      </span>
    )
  }
  if (state === 'failed') {
    return (
      <span className={cn(base, 'bg-status-error/15 text-status-error')}>
        <X aria-hidden="true" className="size-3" strokeWidth={3} />
      </span>
    )
  }
  if (state === 'waiting' || state === 'running') {
    return (
      <Loader2
        aria-hidden="true"
        className={cn(
          'size-[18px] shrink-0 animate-spin',
          state === 'waiting' ? 'text-status-info' : 'text-status-warning',
        )}
      />
    )
  }
  return (
    <span
      className={cn(
        base,
        'border-[1.5px]',
        state === 'timedOut' ? 'border-status-warning' : 'border-muted-foreground/40',
      )}
    />
  )
}

function Bar({
  state,
  startOffsetMs,
  durationMs,
  spanMs,
}: {
  state: StepRowState
  startOffsetMs: number
  durationMs: number
  spanMs: number
}) {
  const left = (startOffsetMs / spanMs) * 100
  const width = Math.max((durationMs / spanMs) * 100, 0.75)
  return (
    <span className="relative h-2 min-w-[60px] flex-1 overflow-hidden rounded-full bg-muted/40">
      <span
        className={cn('absolute inset-y-0 rounded-full', BAR[state])}
        style={{ left: `${left}%`, width: `${width}%` }}
      />
    </span>
  )
}

interface StepRowProps {
  item: StepItem
  spanMs: number
  selected: boolean
  onSelect: (id: string) => void
  /** Inside an opened group: indented under it. */
  nested?: boolean
}

export function StepRow({ item, spanMs, selected, onSelect, nested }: StepRowProps) {
  const { row } = item
  const tries = row.attemptCount

  function handleClick() {
    onSelect(item.id)
  }

  return (
    <li
      id={stepRowDomId(item.id)}
      className={cn(
        'flex flex-col border-b border-border/50 last:border-b-0',
        selected && cn('bg-accent/50', ACCENT[item.state]),
      )}
    >
      <button
        type="button"
        aria-pressed={selected}
        onClick={handleClick}
        className={cn(
          'flex w-full items-center gap-3 py-2.5 pr-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
          nested ? 'pl-9' : 'pl-4',
        )}
      >
        <StateMark state={item.state} />
        <span className="flex w-[150px] min-w-0 shrink-0 flex-col">
          <span className="truncate text-[13px] font-medium text-foreground">{item.name}</span>
          <span className="truncate font-mono text-[11px] text-muted-foreground">{item.label}</span>
        </span>
        <Bar
          state={item.state}
          startOffsetMs={row.startOffsetMs}
          durationMs={row.durationMs}
          spanMs={spanMs}
        />
        {tries > 1 && (
          <span className="shrink-0 rounded-full bg-status-warning/15 px-1.5 py-0.5 text-[11px] font-medium text-status-warning">
            ×{tries}
          </span>
        )}
        <span className="w-[58px] shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground">
          {formatDurationMs(row.durationMs)}
        </span>
      </button>
      {item.state === 'failed' && row.error && (
        <span
          className={cn(
            'pb-2.5 pr-4 font-mono text-[11.5px] leading-normal text-status-error/90',
            nested ? 'pl-[66px]' : 'pl-[46px]',
          )}
        >
          {stepErrorLine(row.error)}
        </span>
      )}
    </li>
  )
}

interface GroupRowProps {
  group: StepGroup
  spanMs: number
  open: boolean
  onToggle: (id: string) => void
  selectedId: string | undefined
  onSelect: (id: string) => void
}

export function GroupRow({ group, spanMs, open, onToggle, selectedId, onSelect }: GroupRowProps) {
  function handleClick() {
    onToggle(group.id)
  }

  return (
    <li className="flex flex-col border-b border-border/50 last:border-b-0">
      <button
        type="button"
        aria-expanded={open}
        onClick={handleClick}
        className="flex w-full items-center gap-3 py-2.5 pl-4 pr-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <StateMark state={group.state} />
        <span className="flex w-[150px] min-w-0 shrink-0 flex-col">
          <span className="flex min-w-0 items-center gap-1.5">
            <ChevronRight
              aria-hidden="true"
              className={cn(
                'size-3 shrink-0 text-muted-foreground transition-transform',
                open && 'rotate-90',
              )}
            />
            <span className="truncate text-[13px] font-medium text-foreground">{group.name}</span>
          </span>
          <span className="truncate text-[11px] text-muted-foreground">{group.meta}</span>
        </span>
        <Bar
          state={group.state}
          startOffsetMs={group.startOffsetMs}
          durationMs={group.durationMs}
          spanMs={spanMs}
        />
        <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
          ×{group.items.length}
        </span>
        <span className="w-[58px] shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground">
          {formatDurationMs(group.durationMs)}
        </span>
      </button>
      {open && (
        <ul className="border-t border-border/50">
          {group.items.map((item) => (
            <StepRow
              key={item.id}
              item={item}
              spanMs={spanMs}
              selected={item.id === selectedId}
              onSelect={onSelect}
              nested
            />
          ))}
        </ul>
      )}
    </li>
  )
}

export function stepErrorLine(raw: string): string {
  const parsed = parseRunError(raw)
  return parsed.name ? `${parsed.name}: ${parsed.message}` : parsed.message
}
