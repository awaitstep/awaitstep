import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'
import { Button } from '../ui/button'

/** A compact button for the diff headers. */
export function HeaderButton({
  children,
  title,
  ...props
}: Omit<React.ComponentProps<typeof Button>, 'size'> & { title?: string }) {
  return (
    <Button size="sm" variant="outline" title={title} className="h-6 px-2 text-xs" {...props}>
      {children}
    </Button>
  )
}

/** The toolbar row above a diff: wraps on narrow editors rather than clipping buttons. */
export function DiffToolbar({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      role="toolbar"
      aria-label={label}
      className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-border bg-card px-3 py-1.5 text-xs"
    >
      {children}
    </div>
  )
}

/** Names the two sides of the diff, above their columns. */
export function SideCaptions({
  sideBySide,
  left,
  right,
}: {
  sideBySide: boolean
  left: string
  right: string
}) {
  if (!sideBySide) {
    return (
      <div className="shrink-0 border-b border-border px-3 py-1 text-2xs text-muted-foreground">
        {left} <span aria-hidden="true">→</span> {right}. Red lines are only in the first, green
        only in the second.
      </div>
    )
  }
  return (
    <div className="grid shrink-0 grid-cols-2 border-b border-border text-2xs text-muted-foreground">
      <span className="truncate px-3 py-1">{left}</span>
      <span className="truncate border-l border-border px-3 py-1">{right}</span>
    </div>
  )
}

export function ViewToggle({
  sideBySide,
  tooNarrow,
  onChange,
}: {
  sideBySide: boolean
  /** The editor is too narrow for two columns; the choice is held back. */
  tooNarrow: boolean
  onChange: (inline: boolean) => void
}) {
  function handleSide() {
    onChange(false)
  }
  function handleInline() {
    onChange(true)
  }
  return (
    <div role="group" aria-label="Layout" className="flex items-center gap-1">
      <button
        type="button"
        aria-pressed={sideBySide}
        onClick={handleSide}
        title={tooNarrow ? 'Too narrow for two columns' : 'Show the two copies side by side'}
        className={cn(chipClass, sideBySide && chipOnClass)}
      >
        Side by side
      </button>
      <button
        type="button"
        aria-pressed={!sideBySide}
        onClick={handleInline}
        title="Show the changes in one column"
        className={cn(chipClass, !sideBySide && chipOnClass)}
      >
        Inline
      </button>
    </div>
  )
}

const chipClass =
  'inline-flex h-6 items-center rounded-md border border-border px-2 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
const chipOnClass = 'border-primary/40 bg-primary/10 text-foreground'
