import { useEffect } from 'react'
import { CircleCheck, CircleX, Info, LoaderCircle, TriangleAlert, X } from 'lucide-react'
import { Toaster as Sonner, toast } from 'sonner'

// The `Toasts` boards: Sonner with rich colours off. Every part is styled in
// styles.css (`.action-toast`); the state colour is on the border, the icon
// and the title only, never the surface. Bottom right, 32 px in; on a phone
// full width inside 16 px gutters (styles.css keeps it clear of the tab bar).

const ICON = { size: 16, strokeWidth: 2, 'aria-hidden': true } as const

const ICONS = {
  success: <CircleCheck {...ICON} />,
  error: <CircleX {...ICON} />,
  warning: <TriangleAlert {...ICON} />,
  info: <Info {...ICON} />,
  loading: <LoaderCircle {...ICON} className="animate-spin motion-reduce:animate-none" />,
  close: <X size={13} strokeWidth={2} aria-hidden />,
}

/** The board's default duration; errors and toasts with an action stay longer (`actionToast`). */
export const TOAST_MS = 4_000

const TOAST_OPTIONS = {
  unstyled: true,
  classNames: { toast: 'action-toast' },
  closeButtonAriaLabel: 'Dismiss',
}

const SWIPE: Record<NonNullable<ToasterProps['position']>, ('right' | 'top')[]> = {
  'bottom-right': ['right'],
  'top-center': ['top'],
}

interface ToasterProps {
  theme: 'light' | 'dark'
  /** Top centre on the canvas, where the bottom right holds its controls. */
  position?: 'bottom-right' | 'top-center'
}

/** The app's one Toaster. */
export function Toaster({ theme, position = 'bottom-right' }: ToasterProps) {
  // Keyboard focus in the stack acts as hover does: it expands and pauses it
  // (Sonner only listens to the mouse). Esc dismisses the toast in focus.
  // Document listeners are a genuine subscription.
  useEffect(() => {
    function list(node: EventTarget | null): HTMLElement | null {
      return node instanceof Element ? node.closest<HTMLElement>('[data-sonner-toaster]') : null
    }
    function handleFocusIn(event: FocusEvent) {
      list(event.target)?.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }))
    }
    function handleFocusOut(event: FocusEvent) {
      const from = list(event.target)
      if (from && list(event.relatedTarget) !== from) {
        from.dispatchEvent(
          new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }),
        )
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      const stack = list(document.activeElement)
      if (!stack) return
      const item =
        document.activeElement?.closest<HTMLElement>('[data-sonner-toast]') ??
        stack.querySelector<HTMLElement>('[data-sonner-toast][data-front="true"]')
      if (item?.dataset.testid) toast.dismiss(item.dataset.testid)
    }
    document.addEventListener('focusin', handleFocusIn)
    document.addEventListener('focusout', handleFocusOut)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('focusin', handleFocusIn)
      document.removeEventListener('focusout', handleFocusOut)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  return (
    <Sonner
      theme={theme}
      position={position}
      offset={32}
      mobileOffset={16}
      gap={14}
      visibleToasts={3}
      duration={TOAST_MS}
      closeButton
      swipeDirections={SWIPE[position]}
      icons={ICONS}
      toastOptions={TOAST_OPTIONS}
    />
  )
}
