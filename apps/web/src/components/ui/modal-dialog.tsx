import type { ReactElement, ReactNode } from 'react'
import { Dialog, DialogContent, DialogTrigger } from './dialog'
import { OverlayBody, OverlayFooter, OverlayHeader } from './overlay-parts'
import { hasContent } from './has-content'

export interface OverlayProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /**
   * The button that opens it. Pass it here rather than beside the overlay so
   * focus returns to it on close.
   */
  trigger?: ReactElement
  /** Tile, icon or avatar before the title. */
  leading?: ReactNode
  title: ReactNode
  description?: ReactNode
  /** Left of the footer actions: a hint, or a destructive text action. */
  footerStart?: ReactNode
  /** Right-aligned footer buttons, primary last. */
  actions: ReactNode
  children: ReactNode
}

interface ModalDialogProps extends OverlayProps {
  size?: 'sm' | 'md' | 'lg'
}

/**
 * Centred dialog with the dashboard's anatomy: header (leading tile, title,
 * description, Close), a body that scrolls, and a footer band of actions.
 */
export function ModalDialog({
  open,
  onOpenChange,
  trigger,
  leading,
  title,
  description,
  footerStart,
  actions,
  size = 'lg',
  children,
}: ModalDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent
        layout="sectioned"
        size={size}
        {...(hasContent(description) ? {} : { 'aria-describedby': undefined })}
      >
        <OverlayHeader leading={leading} title={title} description={description} />
        <OverlayBody>{children}</OverlayBody>
        <OverlayFooter start={footerStart}>{actions}</OverlayFooter>
      </DialogContent>
    </Dialog>
  )
}
