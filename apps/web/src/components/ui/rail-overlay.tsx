import type { ReactNode } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'

interface RailOverlayProps {
  title: string
  /** Beside the title, before Close: e.g. "Mark all as read". */
  actions?: ReactNode
  onClose: () => void
  /** Under the title row; the overlay is a column, so a child can take the rest and scroll. */
  children: ReactNode
}

/**
 * A panel the rail opens over the page (`?open=`), beside the rail and full
 * screen on a phone: the Inbox and extensions' panels. A fixed height, so its
 * content scrolls inside rather than resizing it.
 */
export function RailOverlay({ title, actions, onClose, children }: RailOverlayProps) {
  function handleOpenChange(open: boolean) {
    if (!open) onClose()
  }

  return (
    <DialogPrimitive.Root open onOpenChange={handleOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-card text-card-foreground focus-visible:outline-none md:inset-auto md:bottom-4 md:left-[84px] md:h-[min(700px,calc(100vh-32px))] md:w-[420px] md:rounded md:border md:border-border md:shadow-2xl"
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
