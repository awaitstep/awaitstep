import { useState } from 'react'
import * as Popover from '@radix-ui/react-popover'
import { DayPicker } from 'react-day-picker'
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '../../lib/utils'
import 'react-day-picker/style.css'

interface DateTimePickerProps {
  value: Date | null
  onChange: (date: Date | null) => void
  minDate?: Date
  placeholder?: string
  className?: string
}

export function DateTimePicker({ value, onChange, minDate, placeholder = 'Pick a date & time', className }: DateTimePickerProps) {
  const [open, setOpen] = useState(false)
  const [hours, setHours] = useState(value ? String(value.getHours()).padStart(2, '0') : '')
  const [minutes, setMinutes] = useState(value ? String(value.getMinutes()).padStart(2, '0') : '')

  const handleDaySelect = (day: Date | undefined) => {
    if (!day) return
    const h = hours ? parseInt(hours) : 0
    const m = minutes ? parseInt(minutes) : 0
    const date = new Date(day)
    date.setHours(h, m, 0, 0)
    onChange(date)
  }

  const handleTimeChange = (h: string, m: string) => {
    setHours(h)
    setMinutes(m)
    if (value) {
      const date = new Date(value)
      date.setHours(h ? parseInt(h) : 0, m ? parseInt(m) : 0, 0, 0)
      onChange(date)
    }
  }

  const displayValue = value
    ? value.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) +
      ' ' +
      value.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
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
              button_previous: 'h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted/60 hover:text-foreground',
              button_next: 'h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted/60 hover:text-foreground',
              weekdays: 'flex',
              weekday: 'w-9 text-center text-[11px] font-medium text-muted-foreground/60',
              weeks: 'mt-1',
              week: 'flex',
              day: 'h-9 w-9 text-center text-sm',
              day_button: 'h-9 w-9 rounded-md text-foreground/60 hover:bg-muted/60 hover:text-foreground transition-colors disabled:text-muted-foreground/30 disabled:pointer-events-none disabled:line-through disabled:decoration-muted-foreground/30 disabled:hover:bg-transparent',
              selected: '!bg-primary !text-primary-foreground rounded-md',
              disabled: '',
              today: 'font-bold text-foreground',
              outside: 'text-muted-foreground/30',
            }}
          />

          {/* Time picker */}
          <div className="mt-2 flex items-center gap-2 border-t border-border pt-3">
            <span className="text-xs text-muted-foreground">Time</span>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={0}
                max={23}
                value={hours}
                onChange={(e) => handleTimeChange(e.target.value.slice(0, 2), minutes)}
                placeholder="HH"
                className="w-12 rounded-md border border-border bg-muted/50 px-2 py-1.5 text-center text-sm text-foreground outline-none focus:border-primary/50"
              />
              <span className="text-muted-foreground/60">:</span>
              <input
                type="number"
                min={0}
                max={59}
                value={minutes}
                onChange={(e) => handleTimeChange(hours, e.target.value.slice(0, 2))}
                placeholder="MM"
                className="w-12 rounded-md border border-border bg-muted/50 px-2 py-1.5 text-center text-sm text-foreground outline-none focus:border-primary/50"
              />
            </div>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
