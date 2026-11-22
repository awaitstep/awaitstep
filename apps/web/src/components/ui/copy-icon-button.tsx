import { Check, Copy, X } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Button } from './button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip'
import { useCopyStatus } from './use-copy-status'

const TIP = { idle: 'Copy', copied: 'Copied', failed: 'Couldn’t copy' } as const
const ICON = { idle: Copy, copied: Check, failed: X } as const
const TONE = {
  idle: 'text-muted-foreground hover:text-foreground',
  copied: 'text-status-success',
  failed: 'text-status-error',
} as const

/** A small copy icon that puts `value` on the clipboard; it turns into a tick once copied. */
export function CopyIconButton({
  value,
  label,
  className,
}: {
  value: string
  /** What is copied, for the accessible name ("Copy the instance id"). */
  label: string
  className?: string
}) {
  const copy = useCopyStatus(value)
  const Icon = ICON[copy.status]

  function handleCopy() {
    void copy.copy()
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn('size-6 shrink-0 [&_svg]:size-3.5', TONE[copy.status], className)}
            aria-label={`Copy the ${label.toLowerCase()}`}
            onClick={handleCopy}
          >
            <Icon aria-hidden="true" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{TIP[copy.status]}</TooltipContent>
      </Tooltip>
      <span className="sr-only" aria-live="polite">
        {copy.status === 'idle' ? '' : TIP[copy.status]}
      </span>
    </TooltipProvider>
  )
}
