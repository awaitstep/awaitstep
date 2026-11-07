import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu'
import { forwardRef } from 'react'

export const DropdownMenu = DropdownMenuPrimitive.Root
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger
export const DropdownMenuGroup = DropdownMenuPrimitive.Group

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

export const DropdownMenuLabel = forwardRef<
  HTMLDivElement,
  DropdownMenuPrimitive.DropdownMenuLabelProps
>(({ className = '', ...props }, ref) => (
  <DropdownMenuPrimitive.Label
    ref={ref}
    className={`px-2.5 py-1.5 text-xs text-muted-foreground ${className}`}
    {...props}
  />
))
DropdownMenuLabel.displayName = 'DropdownMenuLabel'

export const DropdownMenuSub = DropdownMenuPrimitive.Sub

export const DropdownMenuSubTrigger = forwardRef<
  HTMLDivElement,
  DropdownMenuPrimitive.DropdownMenuSubTriggerProps
>(({ className = '', ...props }, ref) => (
  <DropdownMenuPrimitive.SubTrigger
    ref={ref}
    className={`flex cursor-pointer select-none items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-foreground/70 outline-none transition-colors hover:bg-muted/60 hover:text-foreground focus:bg-muted/60 focus:text-foreground data-[state=open]:bg-muted/60 ${className}`}
    {...props}
  />
))
DropdownMenuSubTrigger.displayName = 'DropdownMenuSubTrigger'

export const DropdownMenuSubContent = forwardRef<
  HTMLDivElement,
  DropdownMenuPrimitive.DropdownMenuSubContentProps
>(({ className = '', ...props }, ref) => (
  <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.SubContent
      ref={ref}
      sideOffset={4}
      className={`z-50 min-w-[180px] rounded-md border border-border bg-card p-1 shadow-lg ${className}`}
      {...props}
    />
  </DropdownMenuPrimitive.Portal>
))
DropdownMenuSubContent.displayName = 'DropdownMenuSubContent'
