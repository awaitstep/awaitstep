import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

/** The group of pane toggles at the end of an editing surface's bottom bar. */
export function PaneToggles({ children }: { children: ReactNode }) {
  return (
    <div className="ml-1 flex items-center gap-0.5 border-l border-border pl-1.5">{children}</div>
  )
}

interface PaneToggleProps {
  icon: LucideIcon
  pressed: boolean
  /** Names the toggle for assistive tech and the tooltip, shortcut included. */
  title: string
  onClick: () => void
  /** Shown beside the icon where the icon alone would not say what it shows. */
  label?: string
  disabled?: boolean
}

/** One pane's show/hide button, sized for a bottom bar. */
export function PaneToggle({
  icon: Icon,
  pressed,
  title,
  onClick,
  label,
  disabled,
}: PaneToggleProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={pressed}
      disabled={disabled}
      className={cn(
        'inline-flex h-5 items-center gap-1 rounded px-1.5 transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
        pressed && 'bg-muted text-foreground',
      )}
    >
      <Icon aria-hidden="true" className="size-3.5" />
      {label}
    </button>
  )
}
