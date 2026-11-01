import { useState } from 'react'
import * as Popover from '@radix-ui/react-popover'
import { Command } from 'cmdk'
import { Check, ChevronDown, Search } from 'lucide-react'
import { cn } from '../../lib/utils'

export interface SearchableOption<T extends string> {
  value: T
  label: string
  /** Shown at the right of the row, e.g. how many nodes are in it. */
  count?: number
}

interface SearchableSelectProps<T extends string> {
  /** Names the trigger and the list for screen readers, e.g. "Category". */
  label: string
  value: T
  onChange: (value: T) => void
  options: SearchableOption<T>[]
  /** The search box's placeholder, e.g. "Search categories". */
  searchPlaceholder: string
  /** Said when nothing matches what was typed. */
  emptyText?: string
  className?: string
}

/** Matches the typed text anywhere in the option's label, ignoring case. */
function filterByLabel(_value: string, search: string, keywords?: string[]): number {
  const query = search.trim().toLowerCase()
  if (!query) return 1
  return keywords?.some((k) => k.toLowerCase().includes(query)) ? 1 : 0
}

/**
 * A select whose options can be searched: a 36 px trigger (it sits in toolbar
 * rows beside the search field and the selects) that opens a list with a
 * search box on top. For option lists too long for pills.
 */
export function SearchableSelect<T extends string>({
  label,
  value,
  onChange,
  options,
  searchPlaceholder,
  emptyText = 'Nothing matches.',
  className,
}: SearchableSelectProps<T>) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const current = options.find((o) => o.value === value)

  // Each opening starts from the whole list.
  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) setQuery('')
  }

  function handleSelect(next: T) {
    onChange(next)
    handleOpenChange(false)
  }

  return (
    <Popover.Root open={open} onOpenChange={handleOpenChange}>
      <Popover.Trigger
        aria-label={`${label}: ${current?.label ?? value}`}
        className={cn(
          // Its own width in a toolbar row: shrinking hid the value and pushed
          // the chevron out of the border. Only a long value truncates.
          'flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-[9px] border border-border bg-card px-3 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          className,
        )}
      >
        <span className="text-muted-foreground">{label}</span>
        <span className="max-w-40 truncate font-medium">{current?.label ?? value}</span>
        {/* At the right edge whatever width the trigger is given. */}
        <ChevronDown
          className="ml-auto size-3.5 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          // Lines up with the trigger's right edge (it usually ends a toolbar
          // row) and keeps the page gutter from the screen's edges.
          align="end"
          sideOffset={4}
          collisionPadding={16}
          className="z-50 flex max-h-[min(360px,var(--radix-popover-content-available-height))] w-64 max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-lg"
        >
          <Command
            label={label}
            filter={filterByLabel}
            defaultValue={value}
            loop
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3 text-muted-foreground">
              <Search className="size-3.5 shrink-0" aria-hidden="true" />
              <Command.Input
                value={query}
                onValueChange={setQuery}
                placeholder={searchPlaceholder}
                className="h-full min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
              />
            </div>
            <Command.List className="min-h-0 flex-1 overflow-y-auto p-1.5">
              <Command.Empty className="px-2 py-6 text-center text-xs text-muted-foreground">
                {emptyText}
              </Command.Empty>
              {options.map((option) => (
                <SearchableRow
                  key={option.value}
                  option={option}
                  selected={option.value === value}
                  onChoose={handleSelect}
                />
              ))}
            </Command.List>
          </Command>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

interface SearchableRowProps<T extends string> {
  option: SearchableOption<T>
  selected: boolean
  onChoose: (value: T) => void
}

function SearchableRow<T extends string>({ option, selected, onChoose }: SearchableRowProps<T>) {
  function handleSelect() {
    onChoose(option.value)
  }

  return (
    <Command.Item
      value={option.value}
      keywords={[option.label]}
      onSelect={handleSelect}
      aria-current={selected ? 'true' : undefined}
      className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-foreground data-[selected=true]:bg-accent"
    >
      {selected ? (
        <Check className="size-3.5 shrink-0 text-primary" role="img" aria-label="Selected" />
      ) : (
        <span className="size-3.5 shrink-0" aria-hidden="true" />
      )}
      <span className="min-w-0 flex-1 truncate">{option.label}</span>
      {option.count !== undefined && (
        <span className="text-2xs tabular-nums text-muted-foreground">{option.count}</span>
      )}
    </Command.Item>
  )
}
