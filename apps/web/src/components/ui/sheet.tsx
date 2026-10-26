import * as DialogPrimitive from '@radix-ui/react-dialog'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../lib/utils'
import { overlayBackdropVariants } from './overlay-parts'

const Sheet = DialogPrimitive.Root
const SheetTrigger = DialogPrimitive.Trigger
const SheetClose = DialogPrimitive.Close
const SheetTitle = DialogPrimitive.Title
const SheetDescription = DialogPrimitive.Description

const sheetVariants = cva(
  'fixed z-50 flex flex-col shadow-lg data-[state=open]:animate-in data-[state=open]:duration-200 data-[state=closed]:animate-out data-[state=closed]:duration-150',
  {
    variants: {
      side: {
        right:
          'bottom-0 right-0 top-0 w-full border-l border-border data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right',
        left: 'bottom-0 left-0 top-0 w-full border-r border-border data-[state=open]:slide-in-from-left data-[state=closed]:slide-out-to-left',
        // The phone project menu: full width, rounded top, never taller than the screen.
        bottom:
          'inset-x-0 bottom-0 max-h-[92svh] rounded-t-2xl border-t border-border data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom',
      },
      size: {
        sm: 'max-w-xs',
        md: 'max-w-md',
        lg: 'max-w-[560px]',
      },
      // `sectioned` is the dashboard's header / scrolling body / footer panel
      // built from overlay-parts; `padded` is the original sheet surface.
      layout: {
        padded: 'bg-background',
        sectioned: 'bg-card',
      },
    },
    defaultVariants: {
      side: 'right',
      layout: 'padded',
    },
  },
)

type SheetSide = VariantProps<typeof sheetVariants>['side']

// A left sheet was always narrower (the mobile nav drawer); a bottom sheet
// spans the screen, so it takes no max width.
function defaultSize(side: SheetSide) {
  if (side === 'bottom') return null
  return side === 'left' ? 'sm' : 'md'
}

function SheetContent({
  className,
  side,
  size,
  layout,
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & VariantProps<typeof sheetVariants>) {
  const resolvedSize = size ?? defaultSize(side)
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={overlayBackdropVariants({ layout })} />
      <DialogPrimitive.Content
        className={cn(sheetVariants({ side, size: resolvedSize, layout }), className)}
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

export { Sheet, SheetTrigger, SheetClose, SheetTitle, SheetDescription, SheetContent }
