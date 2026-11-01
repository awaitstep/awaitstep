import * as SelectPrimitive from '@radix-ui/react-select'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '../../lib/utils'

type TriggerAttributes = Pick<
  React.ComponentProps<typeof SelectPrimitive.Trigger>,
  'id' | 'aria-label' | 'aria-describedby' | 'aria-invalid' | 'aria-required' | 'disabled'
>

export interface SelectOption {
  value: string
  label: string
  /** A second line under the label, and muted beside it in the trigger. */
  description?: string
  icon?: React.ReactNode
}

interface SelectProps extends TriggerAttributes {
  value: string
  onValueChange: (value: string) => void
  options: SelectOption[]
  className?: string
}

export function Select({ value, onValueChange, options, className, ...triggerProps }: SelectProps) {
  const selected = options.find((opt) => opt.value === value)
  return (
    <SelectPrimitive.Root value={value} onValueChange={onValueChange}>
      <SelectPrimitive.Trigger
        {...triggerProps}
        className={cn(
          'flex h-10 items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 [&>span:first-child]:truncate [&>span:first-child]:min-w-0',
          className,
        )}
      >
        <SelectPrimitive.Value>
          {selected?.description ? (
            <span className="flex min-w-0 items-center gap-2">
              {selected.icon}
              <span className="truncate">{selected.label}</span>
              <span className="truncate text-muted-foreground">{selected.description}</span>
            </span>
          ) : undefined}
        </SelectPrimitive.Value>
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
                className="relative flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm text-foreground outline-none data-[highlighted]:bg-muted/70 data-[highlighted]:text-foreground"
              >
                {opt.icon}
                <span className="flex min-w-0 flex-1 flex-col">
                  <SelectPrimitive.ItemText>{opt.label}</SelectPrimitive.ItemText>
                  {opt.description && (
                    <span className="text-xs text-muted-foreground">{opt.description}</span>
                  )}
                </span>
                <SelectPrimitive.ItemIndicator>
                  <Check className="h-3.5 w-3.5 text-muted-foreground" />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  )
}
