import type { ReactNode } from 'react'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from './sheet'

interface BottomSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Names the dialog, e.g. "Project menu". Visually hidden; the content carries its own heading row. */
  title: string
  /** The button that opens it. Rendered in place; focus returns to it on close. */
  trigger?: ReactNode
  children: ReactNode
}

/** A sheet that rises from the bottom on phones, with a grabber. Escape and the backdrop close it. */
export function BottomSheet({ open, onOpenChange, title, trigger, children }: BottomSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {trigger && <SheetTrigger asChild>{trigger}</SheetTrigger>}
      <SheetContent side="bottom" layout="sectioned" aria-describedby={undefined}>
        <SheetTitle className="sr-only">{title}</SheetTitle>
        <span
          aria-hidden="true"
          className="mx-auto mb-1 mt-2.5 h-1 w-10 shrink-0 rounded-full bg-muted-foreground/40"
        />
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-[env(safe-area-inset-bottom)]">
          {children}
        </div>
      </SheetContent>
    </Sheet>
  )
}
