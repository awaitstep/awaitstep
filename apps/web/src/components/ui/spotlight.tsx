import type { ComponentProps, ReactNode } from 'react'
import { Search } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Dialog, DialogContent, DialogTitle } from './dialog'
import { Kbd } from './kbd'

interface SpotlightDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Read by screen readers; the search row is the only header on screen. */
  title: string
  /** Escape while the field holds text: return `true` to keep the dialog open (it cleared the text). */
  onEscape?: () => boolean
  children: ReactNode
}

/**
 * A search-first overlay in the upper third of the screen, as macOS Spotlight
 * draws one: a search row on top and the results under it, no title or footer.
 */
export function SpotlightDialog({
  open,
  onOpenChange,
  title,
  onEscape,
  children,
}: SpotlightDialogProps) {
  function handleEscapeKeyDown(event: KeyboardEvent) {
    if (onEscape?.()) event.preventDefault()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        onEscapeKeyDown={handleEscapeKeyDown}
        className="top-[14vh] flex w-[640px] -translate-y-0 flex-col overflow-hidden rounded-xl border-border/80 p-0 shadow-2xl"
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>
        {children}
      </DialogContent>
    </Dialog>
  )
}

/** The Spotlight row: a magnifier, the field the caller renders, and the Esc hint. */
export function SpotlightSearchRow({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4">
      <Search className="size-[18px] shrink-0 text-muted-foreground" aria-hidden="true" />
      {children}
      <Kbd className="hidden sm:inline-flex">esc</Kbd>
    </div>
  )
}

/** Classes for the field inside `SpotlightSearchRow`, a plain input or cmdk's. */
export const SPOTLIGHT_INPUT_CLASS =
  'h-full min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground/70'

/** The scrolling results area under the search row. */
export function SpotlightResults({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('max-h-[min(60vh,440px)] overflow-y-auto overscroll-contain p-2', className)}
      {...props}
    />
  )
}

/** Classes for a group heading in the results (also applied to cmdk's group heading). */
export const SPOTLIGHT_HEADING_CLASS =
  'px-3 pb-1 pt-3 text-2xs font-medium uppercase tracking-wider text-muted-foreground/80'

/** Classes for one result row: label on the left, keys or detail on the right. */
export const SPOTLIGHT_ROW_CLASS =
  'flex h-9 items-center justify-between gap-4 rounded-lg px-3 text-sm text-foreground/85'

/** What the results show when nothing matches. */
export function SpotlightEmpty({ children }: { children: ReactNode }) {
  return <p className="px-3 py-10 text-center text-sm text-muted-foreground">{children}</p>
}
