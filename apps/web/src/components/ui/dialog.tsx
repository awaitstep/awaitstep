import * as DialogPrimitive from '@radix-ui/react-dialog'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../lib/utils'
import { overlayBackdropVariants } from './overlay-parts'

const Dialog = DialogPrimitive.Root
const DialogTrigger = DialogPrimitive.Trigger
const DialogClose = DialogPrimitive.Close

const dialogContentVariants = cva(
  'fixed left-1/2 top-1/2 z-50 max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 border bg-card shadow-lg data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
  {
    variants: {
      size: {
        sm: 'w-[400px]',
        md: 'w-[480px]',
        lg: 'w-[560px]',
        // Side-by-side choice cards plus a wide table (`CreateKey`, 720px).
        xl: 'w-[720px]',
        // The marketplace's card grid needs more room than a form.
        '2xl': 'w-[896px]',
        '3xl': 'w-[1100px]',
      },
      // `padded` is the original bare dialog. `sectioned` is the dashboard's
      // header / scrolling body / footer layout built from overlay-parts.
      layout: {
        padded: 'rounded-md border-border p-6',
        sectioned:
          'flex max-h-[calc(100dvh-3rem)] flex-col overflow-hidden rounded-2xl border-border',
      },
    },
    defaultVariants: {
      size: 'sm',
      layout: 'padded',
    },
  },
)

function DialogContent({
  className,
  children,
  size,
  layout,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> &
  VariantProps<typeof dialogContentVariants>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={overlayBackdropVariants({ layout })} />
      <DialogPrimitive.Content
        className={cn(dialogContentVariants({ size, layout }), className)}
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mb-4 flex flex-col gap-1', className)} {...props} />
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn('text-base font-semibold tracking-tight', className)}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  )
}

function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mt-6 flex items-center justify-end gap-2', className)} {...props} />
}

export {
  Dialog,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
}
