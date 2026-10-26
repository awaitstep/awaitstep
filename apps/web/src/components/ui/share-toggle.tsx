import { useId } from 'react'
import * as SwitchPrimitive from '@radix-ui/react-switch'
import { cn } from '../../lib/utils'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip'

interface ShareToggleProps {
  shared: boolean
  onChange: (shared: boolean) => void
  /** Names the switch, e.g. "Share Lead enrichment with Project 101". */
  label: string
  /**
   * Why the viewer can't change it, e.g. "Viewers can't change sharing".
   * The switch stays focusable so the reason can be read, but ignores input.
   */
  disabledReason?: string
}

/** The Shared / Private switch on a workflow, function or library row. */
export function ShareToggle({ shared, onChange, label, disabledReason }: ShareToggleProps) {
  const reasonId = useId()
  const locked = disabledReason !== undefined

  function handleCheckedChange(next: boolean) {
    if (!locked) onChange(next)
  }

  const control = (
    <SwitchPrimitive.Root
      checked={shared}
      onCheckedChange={handleCheckedChange}
      aria-label={label}
      aria-disabled={locked || undefined}
      aria-describedby={locked ? reasonId : undefined}
      className={cn(
        'relative h-5 w-9 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        shared ? 'bg-primary' : 'bg-input',
        locked && 'cursor-not-allowed opacity-50',
      )}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          'block size-4 translate-x-0.5 rounded-full transition-transform',
          shared ? 'translate-x-[18px] bg-primary-foreground' : 'bg-muted-foreground',
        )}
      />
    </SwitchPrimitive.Root>
  )

  return (
    <span className="flex items-center justify-end gap-2 text-2xs text-muted-foreground">
      {/* The switch's checked state already says this to screen readers. */}
      <span aria-hidden="true">{shared ? 'Shared' : 'Private'}</span>
      {locked ? (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>{control}</TooltipTrigger>
            <TooltipContent>{disabledReason}</TooltipContent>
          </Tooltip>
          <span id={reasonId} className="sr-only">
            {disabledReason}
          </span>
        </TooltipProvider>
      ) : (
        control
      )}
    </span>
  )
}
