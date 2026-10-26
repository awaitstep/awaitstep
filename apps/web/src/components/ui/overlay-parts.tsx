import type { ReactNode } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { cva } from 'class-variance-authority'
import { X } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Button } from './button'
import { hasContent } from './has-content'

/** The dimmed layer behind a dialog or sheet; sectioned overlays dim harder. */
export const overlayBackdropVariants = cva(
  'fixed inset-0 z-50 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
  {
    variants: {
      layout: {
        padded: 'bg-black/40',
        sectioned: 'bg-black/70',
      },
    },
    defaultVariants: { layout: 'padded' },
  },
)

interface OverlayHeaderProps {
  /** A tile, icon or avatar before the title. */
  leading?: ReactNode
  title: ReactNode
  description?: ReactNode
  /** Rules the header off from the body, as in a side panel. */
  divided?: boolean
}

/**
 * Title row of a sectioned dialog or sheet: leading tile, title, one-line
 * description and the Close button. Must render inside a Radix Dialog, whose
 * Title and Description name and describe the overlay.
 */
export function OverlayHeader({ leading, title, description, divided }: OverlayHeaderProps) {
  return (
    <div
      className={cn(
        'flex shrink-0 gap-3.5 px-6',
        divided ? 'items-center border-b border-border py-5' : 'items-start pt-6',
      )}
    >
      {hasContent(leading) && <span className="shrink-0">{leading}</span>}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <DialogPrimitive.Title className="text-base font-semibold text-foreground">
          {title}
        </DialogPrimitive.Title>
        {hasContent(description) && (
          <DialogPrimitive.Description className="text-xs text-muted-foreground">
            {description}
          </DialogPrimitive.Description>
        )}
      </div>
      <DialogPrimitive.Close asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 shrink-0 text-muted-foreground"
          aria-label="Close"
        >
          <X aria-hidden="true" />
        </Button>
      </DialogPrimitive.Close>
    </div>
  )
}

/** The scrolling middle of a sectioned overlay; header and footer stay put. */
export function OverlayBody({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4.5 overflow-y-auto px-6 py-5">{children}</div>
  )
}

interface OverlayFooterProps {
  /** Left of the actions: a hint, or a destructive text action. */
  start?: ReactNode
  /** Right-aligned buttons, primary last. */
  children: ReactNode
}

/** The action band at the bottom of a sectioned overlay. */
export function OverlayFooter({ start, children }: OverlayFooterProps) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2.5 border-t border-border bg-background/50 px-6 py-4">
      {hasContent(start) && (
        <div className="flex min-w-0 items-center gap-2 text-2xs text-muted-foreground">
          {start}
        </div>
      )}
      <div className="ml-auto flex items-center gap-2.5">{children}</div>
    </div>
  )
}
