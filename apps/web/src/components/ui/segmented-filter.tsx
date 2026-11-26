import { cn } from '../../lib/utils'

export interface FilterOption<Id extends string> {
  id: Id
  label: string
  count?: number
  /** `danger` tints the count red when it is above zero, e.g. "Failing 2". */
  tone?: 'danger'
}

interface SegmentedFilterProps<Id extends string> {
  /** Names the group, e.g. "Filter workflows". */
  label: string
  options: FilterOption<Id>[]
  value: Id
  onChange: (id: Id) => void
}

/** Pills that narrow a list, one pressed at a time, each with its count. */
export function SegmentedFilter<Id extends string>({
  label,
  options,
  value,
  onChange,
}: SegmentedFilterProps<Id>) {
  return (
    <div
      role="group"
      aria-label={label}
      // On a phone the pills scroll sideways on one line; wider, they wrap.
      className="flex max-w-full gap-1 overflow-x-auto rounded border border-border bg-card p-1 scrollbar-none sm:flex-wrap sm:overflow-visible"
    >
      {options.map((option) => (
        <FilterPill
          key={option.id}
          option={option}
          pressed={option.id === value}
          onPick={onChange}
        />
      ))}
    </div>
  )
}

interface FilterPillProps<Id extends string> {
  option: FilterOption<Id>
  pressed: boolean
  onPick: (id: Id) => void
}

function FilterPill<Id extends string>({ option, pressed, onPick }: FilterPillProps<Id>) {
  function handleClick() {
    onPick(option.id)
  }

  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={handleClick}
      className={cn(
        'flex h-[30px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        pressed ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {option.label}
      {option.count !== undefined && (
        <>
          {' '}
          <span
            className={cn(
              'rounded-full px-1.5 text-2xs tabular-nums',
              option.tone === 'danger' && option.count > 0
                ? 'bg-tone-fail text-status-error'
                : 'bg-muted text-muted-foreground',
            )}
          >
            {option.count}
          </span>
        </>
      )}
    </button>
  )
}
