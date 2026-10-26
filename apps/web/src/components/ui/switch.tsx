import { useId } from 'react'
import * as SwitchPrimitive from '@radix-ui/react-switch'
import { cn } from '../../lib/utils'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip'

const TRACK_ON = { primary: 'bg-primary', warn: 'bg-status-warning' } as const
const THUMB_ON = { primary: 'bg-primary-foreground', warn: 'bg-background' } as const

interface SwitchProps {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  /** Names the switch, e.g. "Deletion lock". */
  label: string
  /** `warn` (amber) for switches that guard something, like the deletion lock. */
  tone?: keyof typeof TRACK_ON
  /**
   * Why it can't be changed, e.g. "Viewers can't change sharing". The switch
   * stays focusable so the reason can be read, but ignores input.
   */
  disabledReason?: string
}

/** An on/off switch; when locked, it explains why on hover and to screen readers. */
export function Switch({
  checked,
  onCheckedChange,
  label,
  tone = 'primary',
  disabledReason,
}: SwitchProps) {
  const reasonId = useId()
  const locked = disabledReason !== undefined

  function handleCheckedChange(next: boolean) {
    if (!locked) onCheckedChange(next)
  }

  const control = (
    <SwitchPrimitive.Root
      checked={checked}
      onCheckedChange={handleCheckedChange}
      aria-label={label}
      aria-disabled={locked || undefined}
      aria-describedby={locked ? reasonId : undefined}
      className={cn(
        'relative h-5 w-9 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        checked ? TRACK_ON[tone] : 'bg-input',
        locked && 'cursor-not-allowed opacity-50',
      )}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          'block size-4 translate-x-0.5 rounded-full transition-transform',
          checked ? cn('translate-x-[18px]', THUMB_ON[tone]) : 'bg-muted-foreground',
        )}
      />
    </SwitchPrimitive.Root>
  )

  if (!locked) return control

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{control}</TooltipTrigger>
        <TooltipContent>{disabledReason}</TooltipContent>
      </Tooltip>
      <span id={reasonId} className="sr-only">
        {disabledReason}
      </span>
    </TooltipProvider>
  )
}
