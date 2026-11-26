import type { ComponentProps } from 'react'
import { cn } from '../../lib/utils'

/** A key or chord as it is shown beside an action: "⌘K", "/", "G P". */
export function Kbd({ className, ...props }: ComponentProps<'kbd'>) {
  return (
    <kbd
      className={cn(
        'inline-flex shrink-0 items-center rounded border border-border bg-muted/40 px-1.5 font-sans text-2xs leading-4 text-muted-foreground',
        className,
      )}
      {...props}
    />
  )
}
