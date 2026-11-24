import type { ComponentPropsWithoutRef } from 'react'
import * as PopoverPrimitive from '@radix-ui/react-popover'
import { cn } from '../../lib/utils'

export const Popover = PopoverPrimitive.Root
export const PopoverTrigger = PopoverPrimitive.Trigger
export const PopoverAnchor = PopoverPrimitive.Anchor

/** A card that floats beside its trigger or anchor, kept inside the viewport. */
export function PopoverContent({
  className,
  sideOffset = 8,
  collisionPadding = 16,
  ...props
}: ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        className={cn(
          'z-50 flex max-h-[var(--radix-popover-content-available-height)] flex-col overflow-hidden rounded-lg border border-border bg-card shadow-lg outline-none',
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  )
}
