import { useId } from 'react'
import { cn } from '../../lib/utils'

export interface SegmentedChoiceOption<Value extends string> {
  value: Value
  label: string
}

interface SegmentedChoiceProps<Value extends string> {
  /** Names the group, e.g. "Role". */
  label: string
  options: SegmentedChoiceOption<Value>[]
  value: Value
  onChange: (value: Value) => void
}

/**
 * One of a few short options as segments ("Editor | Viewer | Workspace
 * admin"). Native radios underneath, so arrow keys move the choice.
 */
export function SegmentedChoice<Value extends string>({
  label,
  options,
  value,
  onChange,
}: SegmentedChoiceProps<Value>) {
  const name = useId()
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex w-fit flex-wrap gap-1 rounded-[10px] border border-border bg-background p-1"
    >
      {options.map((option) => {
        const checked = option.value === value
        return (
          <label
            key={option.value}
            className={cn(
              'flex h-7 cursor-pointer items-center rounded-[7px] px-3 text-xs font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
              checked ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={checked}
              onChange={() => onChange(option.value)}
              className="sr-only"
            />
            {option.label}
          </label>
        )
      })}
    </div>
  )
}
