import type { ReactNode } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '../../lib/utils'

interface RailOverlayProps {
  title: string
  /** Beside the title, before Close: e.g. "Mark all as read". */
  actions?: ReactNode
  onClose: () => void
  /**
   * As tall as its content, up to the usual height, rather than always that
   * tall: for a short panel (Help). The body then scrolls past the cap.
   */
  fit?: boolean
  /** Under the title row; the overlay is a column, so a child can take the rest and scroll. */
  children: ReactNode
}

/**
 * A panel the rail opens over the page (`?open=`), beside the rail and full
 * screen on a phone: the Inbox and extensions' panels. A fixed height, so its
 * content scrolls inside rather than resizing it, unless it fits its content.
 */
export function RailOverlay({ title, actions, onClose, fit, children }: RailOverlayProps) {
  function handleOpenChange(open: boolean) {
    if (!open) onClose()
  }

  return (
    <DialogPrimitive.Root open onOpenChange={handleOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className={cn(
            'fixed inset-0 z-50 flex flex-col overflow-hidden bg-card text-card-foreground focus-visible:outline-none md:inset-auto md:bottom-4 md:left-[84px] md:w-[420px] md:rounded md:border md:border-border md:shadow-2xl',
            fit ? 'md:max-h-[min(700px,calc(100vh-32px))]' : 'md:h-[min(700px,calc(100vh-32px))]',
          )}
        >
          <div className="flex items-center gap-2 px-4 pb-2.5 pt-3.5">
            <DialogPrimitive.Title className="flex-1 text-base font-semibold">
              {title}
            </DialogPrimitive.Title>
            {actions}
            <DialogPrimitive.Close
              aria-label="Close"
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="size-4" aria-hidden="true" />
            </DialogPrimitive.Close>
          </div>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
