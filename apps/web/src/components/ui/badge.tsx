import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-2xs font-medium',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-muted text-foreground',
        outline: 'border-border text-muted-foreground',
        success: 'border-transparent bg-status-success/10 text-status-success',
        error: 'border-transparent bg-status-error/10 text-status-error',
        warning: 'border-transparent bg-status-warning/15 text-status-warning',
        info: 'border-transparent bg-status-info/10 text-status-info',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant, className }))} {...props} />
}

export { Badge, badgeVariants }
