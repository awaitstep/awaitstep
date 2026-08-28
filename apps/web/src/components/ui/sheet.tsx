import * as DialogPrimitive from '@radix-ui/react-dialog'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../lib/utils'

const Sheet = DialogPrimitive.Root
const SheetTrigger = DialogPrimitive.Trigger
const SheetClose = DialogPrimitive.Close
const SheetTitle = DialogPrimitive.Title

const sheetVariants = cva(
  'fixed z-50 flex flex-col bg-background shadow-lg data-[state=open]:animate-in data-[state=open]:duration-200 data-[state=closed]:animate-out data-[state=closed]:duration-150',
  {
    variants: {
      side: {
        right:
          'bottom-0 right-0 top-0 w-full max-w-md border-l border-border data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right',
        left: 'bottom-0 left-0 top-0 w-full max-w-xs border-r border-border data-[state=open]:slide-in-from-left data-[state=closed]:slide-out-to-left',
      },
    },
    defaultVariants: {
      side: 'right',
    },
  },
)

function SheetContent({
  className,
  side,
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & VariantProps<typeof sheetVariants>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
      <DialogPrimitive.Content className={cn(sheetVariants({ side }), className)} {...props}>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

export { Sheet, SheetTrigger, SheetClose, SheetTitle, SheetContent }
