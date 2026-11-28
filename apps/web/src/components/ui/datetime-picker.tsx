import { useState, type ComponentProps } from 'react'
import * as Popover from '@radix-ui/react-popover'
import { DayPicker } from 'react-day-picker'
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '../../lib/utils'
import 'react-day-picker/style.css'

/** The id and aria attributes `FormField` hands its control land on the trigger. */
type TriggerAttributes = Pick<
  ComponentProps<'button'>,
  'id' | 'aria-describedby' | 'aria-invalid' | 'aria-required'
>

interface DateTimePanelProps {
  value: Date | null
  onChange: (date: Date | null) => void
  minDate?: Date
}

const TIME_INPUT_CLASS =
  'flex-1 rounded-md border border-border bg-muted/50 px-2 py-1.5 text-center text-sm text-foreground outline-none focus:border-primary-ink/50'

function twoDigits(value: number): string {
  return String(value).padStart(2, '0')
}

/** A month calendar with an hour and minute row under it, for a popover of the caller's. */
export function DateTimePanel({ value, onChange, minDate }: DateTimePanelProps) {
  const [hours, setHours] = useState(value ? twoDigits(value.getHours()) : '')
  const [minutes, setMinutes] = useState(value ? twoDigits(value.getMinutes()) : '')

  function handleDaySelect(day: Date | undefined) {
    if (!day) return
    const date = new Date(day)
    date.setHours(hours ? parseInt(hours) : 0, minutes ? parseInt(minutes) : 0, 0, 0)
    onChange(date)
  }

  function handleTimeChange(h: string, m: string) {
    setHours(h)
    setMinutes(m)
    if (value) {
      const date = new Date(value)
      date.setHours(h ? parseInt(h) : 0, m ? parseInt(m) : 0, 0, 0)
      onChange(date)
    }
  }

  return (
    <>
      <DayPicker
        mode="single"
        selected={value ?? undefined}
        onSelect={handleDaySelect}
        disabled={minDate ? { before: minDate } : undefined}
        defaultMonth={value ?? minDate ?? new Date()}
        components={{
          Chevron: ({ orientation }) =>
            orientation === 'left' ? (
              <ChevronLeft className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            ),
        }}
        classNames={{
          root: 'rdp-dark',
          months: 'flex flex-col',
          month_caption: 'flex items-center justify-center py-1',
          caption_label: 'text-sm font-medium text-foreground',
          nav: 'flex items-center gap-1',
          button_previous:
            'h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted/60 hover:text-foreground',
          button_next:
            'h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted/60 hover:text-foreground',
          weekdays: 'flex',
          weekday: 'w-9 text-center text-xs font-medium text-muted-foreground/60',
          weeks: 'mt-1',
          week: 'flex',
          day: 'h-9 w-9 text-center text-sm',
          day_button:
            'h-9 w-9 rounded-md text-foreground/60 hover:bg-muted/60 hover:text-foreground transition-colors disabled:text-muted-foreground/30 disabled:pointer-events-none disabled:line-through disabled:decoration-muted-foreground/30 disabled:hover:bg-transparent',
          // The day's own button sets its text colour, so the selected look goes on the button.
          selected:
            '[&>button]:bg-primary [&>button]:font-semibold [&>button]:text-primary-foreground [&>button:hover]:bg-primary [&>button:hover]:text-primary-foreground',
          disabled: '',
          today: 'font-bold text-foreground',
          outside: 'text-muted-foreground/30',
        }}
      />
      <div className="mt-2 flex items-center gap-2 border-t border-border pt-3">
        <span className="text-xs text-muted-foreground">Time</span>
        <div className="flex flex-1 items-center gap-1">
          <input
            type="number"
            min={0}
            max={23}
            value={hours}
            onChange={(e) => handleTimeChange(e.target.value.slice(0, 2), minutes)}
            placeholder="HH"
            aria-label="Hour"
            className={TIME_INPUT_CLASS}
          />
          <span className="text-muted-foreground/60">:</span>
          <input
            type="number"
            min={0}
            max={59}
            value={minutes}
            onChange={(e) => handleTimeChange(hours, e.target.value.slice(0, 2))}
            placeholder="MM"
            aria-label="Minute"
            className={TIME_INPUT_CLASS}
          />
        </div>
      </div>
    </>
  )
}

interface DateTimePickerProps extends TriggerAttributes {
  value: Date | null
  onChange: (date: Date | null) => void
  minDate?: Date
  placeholder?: string
  className?: string
}

/** A field that shows the picked date and time and opens `DateTimePanel` below it. */
export function DateTimePicker({
  value,
  onChange,
  minDate,
  placeholder = 'Pick a date & time',
  className,
  ...trigger
}: DateTimePickerProps) {
  const [open, setOpen] = useState(false)

  const displayValue = value
    ? value.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) +
      ' ' +
      value.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          {...trigger}
          className={cn(
            'flex h-10 w-full items-center gap-2 rounded-md border border-input bg-transparent px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted/30 focus:outline-none focus:ring-2 focus:ring-ring',
            !displayValue && 'text-muted-foreground/60',
            className,
          )}
        >
          <Calendar className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="flex-1 text-left truncate">{displayValue ?? placeholder}</span>
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="start"
          sideOffset={4}
          className="z-50 rounded-md border border-border bg-card p-3 shadow-lg"
        >
          <DateTimePanel value={value} onChange={onChange} minDate={minDate} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
