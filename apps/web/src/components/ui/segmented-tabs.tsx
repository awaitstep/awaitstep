import * as TabsPrimitive from '@radix-ui/react-tabs'
import { cn } from '../../lib/utils'

const SegmentedTabs = TabsPrimitive.Root

function SegmentedTabList({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn(
        'flex w-fit items-center rounded-lg border border-border bg-muted/40 p-0.5',
        className,
      )}
      {...props}
    />
  )
}

function SegmentedTab({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'inline-flex h-6 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm',
        className,
      )}
      {...props}
    />
  )
}

function SegmentedTabPanel({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content className={cn('focus-visible:outline-none', className)} {...props} />
  )
}

export { SegmentedTabs, SegmentedTabList, SegmentedTab, SegmentedTabPanel }
