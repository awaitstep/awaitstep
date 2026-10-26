import { useId, type ReactElement, type ReactNode, type SyntheticEvent } from 'react'
import { Slot } from '@radix-ui/react-slot'
import { Lock } from 'lucide-react'
import { hasContent } from './has-content'

interface BlockedActionProps {
  /** Why the action can't run, e.g. "Turn off the deletion lock first". */
  reason?: ReactNode
  /** One button or link. */
  children: ReactElement
}

function stop(event: SyntheticEvent) {
  event.preventDefault()
  event.stopPropagation()
}

/**
 * Blocks a button or link and says why under it. It stays focusable so
 * keyboard and screen-reader users reach it and hear the reason; a plain
 * `disabled` would skip it. With no `reason` the action works as normal.
 */
export function BlockedAction({ reason, children }: BlockedActionProps) {
  const reasonId = useId()
  if (!hasContent(reason)) return children

  return (
    <>
      <Slot
        aria-disabled="true"
        aria-describedby={reasonId}
        onClickCapture={stop}
        className="cursor-not-allowed opacity-50"
      >
        {children}
      </Slot>
      <span id={reasonId} className="flex items-center gap-1.5 text-2xs text-status-warning">
        <Lock className="size-3 shrink-0" aria-hidden="true" />
        {reason}
      </span>
    </>
  )
}
