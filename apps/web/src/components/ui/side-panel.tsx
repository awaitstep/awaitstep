import { Sheet, SheetContent, SheetTrigger } from './sheet'
import { OverlayBody, OverlayFooter, OverlayHeader } from './overlay-parts'
import { hasContent } from './has-content'
import type { OverlayProps } from './modal-dialog'

/**
 * Full-height panel from the right with the same anatomy as `ModalDialog`,
 * for editors too tall for a centred dialog. Full width on a phone.
 */
export function SidePanel({
  open,
  onOpenChange,
  trigger,
  leading,
  title,
  description,
  footerStart,
  actions,
  children,
}: OverlayProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {trigger && <SheetTrigger asChild>{trigger}</SheetTrigger>}
      <SheetContent
        side="right"
        size="lg"
        layout="sectioned"
        {...(hasContent(description) ? {} : { 'aria-describedby': undefined })}
      >
        <OverlayHeader leading={leading} title={title} description={description} divided />
        <OverlayBody>{children}</OverlayBody>
        <OverlayFooter start={footerStart}>{actions}</OverlayFooter>
      </SheetContent>
    </Sheet>
  )
}
