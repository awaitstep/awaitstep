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
            'flex h-10 w-full items-center gap-2 rounded-lg border border-input bg-transparent px-3 py-2 text-sm text-white/80 transition-colors hover:bg-white/[0.02] focus:outline-none focus:ring-2 focus:ring-ring',
            !displayValue && 'text-white/30',
            className,
          )}
        >
          <Calendar className="h-4 w-4 shrink-0 text-white/40" />
          <span className="flex-1 text-left truncate">{displayValue ?? placeholder}</span>
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="start"
          sideOffset={4}
          className="z-50 rounded-xl border border-white/[0.08] bg-[oklch(0.14_0_0)] p-3 shadow-[0_8px_30px_rgba(0,0,0,0.5)]"
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
              caption_label: 'text-sm font-medium text-white/80',
              nav: 'flex items-center gap-1',
              button_previous: 'h-7 w-7 rounded-md flex items-center justify-center text-white/40 hover:bg-white/[0.06] hover:text-white/80',
              button_next: 'h-7 w-7 rounded-md flex items-center justify-center text-white/40 hover:bg-white/[0.06] hover:text-white/80',
              weekdays: 'flex',
              weekday: 'w-9 text-center text-[11px] font-medium text-white/30',
              weeks: 'mt-1',
              week: 'flex',
              day: 'h-9 w-9 text-center text-sm',
              day_button: 'h-9 w-9 rounded-md text-white/60 hover:bg-white/[0.06] hover:text-white/90 transition-colors disabled:text-white/10 disabled:pointer-events-none disabled:line-through disabled:decoration-white/10 disabled:hover:bg-transparent',
              selected: '!bg-primary !text-primary-foreground rounded-md',
              disabled: '',
              today: 'font-bold text-white/90',
              outside: 'text-white/10',
            }}
          />

          {/* Time picker */}
          <div className="mt-2 flex items-center gap-2 border-t border-white/[0.06] pt-3">
            <span className="text-xs text-white/40">Time</span>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={0}
                max={23}
                value={hours}
                onChange={(e) => handleTimeChange(e.target.value.slice(0, 2), minutes)}
                placeholder="HH"
                className="w-12 rounded-md border border-white/[0.08] bg-white/[0.04] px-2 py-1.5 text-center text-sm text-white/80 outline-none focus:border-primary/50"
              />
              <span className="text-white/30">:</span>
              <input
                type="number"
                min={0}
                max={59}
                value={minutes}
                onChange={(e) => handleTimeChange(hours, e.target.value.slice(0, 2))}
                placeholder="MM"
                className="w-12 rounded-md border border-white/[0.08] bg-white/[0.04] px-2 py-1.5 text-center text-sm text-white/80 outline-none focus:border-primary/50"
              />
            </div>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
