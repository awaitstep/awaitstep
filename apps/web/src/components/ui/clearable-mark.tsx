import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '../../lib/utils'

interface ClearableMarkProps {
  /** The logo or photo itself. */
  children: ReactNode
  /** Whether there is an image to clear; without one the button isn't shown. */
  hasImage: boolean
  onClear: () => void
  /** Names the button for screen readers, e.g. "Remove logo". */
  clearLabel: string
  disabled?: boolean
  className?: string
}

/**
 * A logo or photo with a small floating clear button on its top-right corner,
 * shown only while there is an image to clear (the initial stays behind).
 */
export function ClearableMark({
  children,
  hasImage,
  onClear,
  clearLabel,
  disabled,
  className,
}: ClearableMarkProps) {
  return (
    <span className={cn('relative inline-flex shrink-0', className)}>
      {children}
      {hasImage && (
        <button
          type="button"
          onClick={onClear}
          disabled={disabled}
          aria-label={clearLabel}
          title={clearLabel}
          className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
        >
          <X className="size-3" aria-hidden="true" />
        </button>
      )}
    </span>
  )
}
