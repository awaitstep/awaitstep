import * as SelectPrimitive from '@radix-ui/react-select'
import { ChevronDown } from 'lucide-react'
import { cn } from '../../lib/utils'

type TriggerAttributes = Pick<
  React.ComponentProps<typeof SelectPrimitive.Trigger>,
  'id' | 'aria-label' | 'aria-describedby' | 'aria-invalid' | 'aria-required'
>

interface SelectProps extends TriggerAttributes {
  value: string
  onValueChange: (value: string) => void
  options: { value: string; label: string }[]
  className?: string
}

export function Select({ value, onValueChange, options, className, ...triggerProps }: SelectProps) {
  return (
    <SelectPrimitive.Root value={value} onValueChange={onValueChange}>
      <SelectPrimitive.Trigger
        {...triggerProps}
        className={cn(
          'flex h-10 items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 [&>span:first-child]:truncate [&>span:first-child]:min-w-0',
          className,
        )}
      >
        <SelectPrimitive.Value />
        <SelectPrimitive.Icon>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>

      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={4}
          className="z-50 max-h-60 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-md border border-border bg-card shadow-lg"
        >
          <SelectPrimitive.Viewport className="p-1">
            {options.map((opt) => (
              <SelectPrimitive.Item
                key={opt.value}
                value={opt.value}
                className="relative flex cursor-pointer items-center rounded-md px-2.5 py-1.5 text-sm text-foreground outline-none data-[highlighted]:bg-muted/70 data-[highlighted]:text-foreground"
              >
                <SelectPrimitive.ItemText>{opt.label}</SelectPrimitive.ItemText>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  )
}
