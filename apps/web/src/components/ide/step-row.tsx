import { ChevronDown, ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import type { StepPlacement } from '@awaitstep/codegen'
import type { StepRow } from '../../lib/ide/step-order'
import type { RailRow } from '../../lib/ide/step-rail-layout'
import { cn } from '../../lib/utils'
import { StepRail } from './step-rail'
import { StepRowMenu, type StepOutgoingEdge } from './step-row-menu'

interface StepRowItemProps {
  row: StepRow
  name: string
  icon: ReactNode
  meta: string | null
  folded: boolean
  /** The graph's entry node gets the entry marker. */
  entry: boolean
  /** The walk never reaches this node from the entry. */
  unreachable: boolean
  /** The vertical lines this row draws. */
  rail: RailRow
  tabbable: boolean
  active: boolean
  selected: boolean
  /** The connections out of this node; the menu offers one entry per connection. */
  outgoing: readonly StepOutgoingEdge[]
  /** False when the workspace cannot edit: the menu stays, disabled. */
  canCreate: boolean
  /** Why it is disabled, worded for the person. */
  readOnlyMessage: string | null
  onPick: (nodeId: string) => void
  onFold: (nodeId: string) => void
  onFocusRow: (nodeId: string) => void
  onCreate: (placement: StepPlacement) => void
}

/** One row of the Steps list, with its fold control and its create menu. */
export function StepRowItem({
  row,
  name,
  icon,
  meta,
  folded,
  entry,
  unreachable,
  rail,
  tabbable,
  active,
  selected,
  outgoing,
  canCreate,
  readOnlyMessage,
  onPick,
  onFold,
  onFocusRow,
  onCreate,
}: StepRowItemProps) {
  const Chevron = folded ? ChevronRight : ChevronDown

  function handleClick() {
    onPick(row.nodeId)
  }

  function handleFocus(event: React.FocusEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) onFocusRow(row.nodeId)
  }

  function handleChevronClick(event: React.MouseEvent) {
    event.stopPropagation()
    onFold(row.nodeId)
  }

  return (
    <div
      role="treeitem"
      tabIndex={tabbable ? 0 : -1}
      data-step-id={row.nodeId}
      aria-level={row.depth + 1}
      aria-expanded={row.container ? !folded : undefined}
      aria-selected={selected}
      aria-current={active ? 'true' : undefined}
      onClick={handleClick}
      onFocus={handleFocus}
      className={cn(
        'group flex min-h-8 w-full cursor-pointer items-center gap-1.5 pr-1 outline-none transition-colors focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary',
        selected
          ? 'bg-primary/10 text-foreground shadow-[inset_2px_0_0_var(--color-primary)]'
          : active
            ? 'bg-muted/70 text-foreground'
            : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground',
      )}
    >
      <StepRail layout={rail} entry={entry} container={row.container} />
      {row.container ? (
        <button
          type="button"
          tabIndex={-1}
          aria-label={folded ? `Expand ${name}` : `Collapse ${name}`}
          onClick={handleChevronClick}
          className="flex h-4 w-4 shrink-0 items-center justify-center rounded hover:bg-muted"
        >
          <Chevron className="h-3 w-3" />
        </button>
      ) : (
        <span className="w-4 shrink-0" aria-hidden />
      )}
      <span className="flex h-4 w-4 shrink-0 items-center justify-center" aria-hidden>
        {icon}
      </span>
      <span className="min-w-0 flex-1 py-1">
        <span className="block truncate text-xs">
          {row.arm && (
            <span className="mr-1.5 rounded border border-border bg-muted/40 px-1 py-px text-3xs uppercase tracking-wider">
              {row.arm}
            </span>
          )}
          {name}
          {entry && (
            <span className="ml-1.5 rounded bg-primary/10 px-1 py-px text-3xs uppercase tracking-wider text-primary">
              Entry
            </span>
          )}
          {unreachable && (
            <span className="ml-1.5 rounded bg-muted px-1 py-px text-3xs uppercase tracking-wider text-muted-foreground">
              Not connected
            </span>
          )}
        </span>
        {meta && <span className="block truncate text-2xs text-muted-foreground">{meta}</span>}
      </span>
      <StepRowMenu
        nodeId={row.nodeId}
        name={name}
        outgoing={outgoing}
        onChoose={onCreate}
        disabled={!canCreate}
        disabledReason={readOnlyMessage}
      />
    </div>
  )
}
