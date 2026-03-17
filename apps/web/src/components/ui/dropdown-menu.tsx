import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu'
import { forwardRef } from 'react'

export const DropdownMenu = DropdownMenuPrimitive.Root
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger

export const DropdownMenuContent = forwardRef<
  HTMLDivElement,
  DropdownMenuPrimitive.DropdownMenuContentProps
>(({ className = '', children, ...props }, ref) => (
  <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.Content
      ref={ref}
      sideOffset={4}
      className={`z-50 min-w-[180px] rounded-md border border-border bg-card p-1 shadow-lg ${className}`}
      {...props}
    >
      {children}
    </DropdownMenuPrimitive.Content>
  </DropdownMenuPrimitive.Portal>
))
DropdownMenuContent.displayName = 'DropdownMenuContent'

export const DropdownMenuItem = forwardRef<
  HTMLDivElement,
  DropdownMenuPrimitive.DropdownMenuItemProps
>(({ className = '', ...props }, ref) => (
  <DropdownMenuPrimitive.Item
    ref={ref}
    className={`flex cursor-pointer select-none items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-foreground/70 outline-none transition-colors hover:bg-muted/60 hover:text-foreground focus:bg-muted/60 focus:text-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-40 ${className}`}
    {...props}
  />
))
DropdownMenuItem.displayName = 'DropdownMenuItem'

export const DropdownMenuSeparator = forwardRef<
  HTMLDivElement,
  DropdownMenuPrimitive.DropdownMenuSeparatorProps
>(({ className = '', ...props }, ref) => (
  <DropdownMenuPrimitive.Separator
    ref={ref}
    className={`my-1 h-px bg-border ${className}`}
    {...props}
  />
))
DropdownMenuSeparator.displayName = 'DropdownMenuSeparator'
