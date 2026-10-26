import { useRef } from 'react'
import { Check } from 'lucide-react'
import { Button, type ButtonProps } from './button'

interface RequestActionProps {
  /** "Ask for edit access". */
  label: string
  /** Shown in the button's place once asked, e.g. "Asked Ama Mensah". */
  sentLabel: string
  requested: boolean
  onRequest: () => void
  variant?: Extract<ButtonProps['variant'], 'default' | 'outline'>
  size?: ButtonProps['size']
}

/**
 * A one-time ask (edit access, a new invite) that turns into a status line
 * once sent. Focus moves to that line, since the button it replaces is gone.
 */
export function RequestAction({
  label,
  sentLabel,
  requested,
  onRequest,
  variant = 'outline',
  size,
}: RequestActionProps) {
  const focusOnSent = useRef(false)

  function handleClick() {
    focusOnSent.current = true
    onRequest()
  }

  function handleStatusRef(node: HTMLSpanElement | null) {
    if (node && focusOnSent.current) {
      focusOnSent.current = false
      node.focus()
    }
  }

  if (requested) {
    return (
      <span
        ref={handleStatusRef}
        role="status"
        tabIndex={-1}
        className="inline-flex items-center gap-2 text-xs text-status-success focus-visible:outline-none"
      >
        <Check className="size-4 shrink-0" aria-hidden="true" />
        {sentLabel}
      </span>
    )
  }

  return (
    <Button type="button" variant={variant} size={size} onClick={handleClick}>
      {label}
    </Button>
  )
}
