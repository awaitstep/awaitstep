import { useState, type ChangeEvent } from 'react'
import type { ScheduleEntry } from '@awaitstep/ir'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { SearchableSelect } from '../ui/searchable-select'
import { Select } from '../ui/select'
import { Textarea } from '../ui/textarea'
import {
  SCHEDULE_PRESETS,
  entryWith,
  paramsFromText,
  readSchedule,
  timeZones,
} from './schedule-model'

interface ScheduleListProps {
  label: string
  placeholder?: string
  items: ScheduleEntry[]
  onChange: (value: unknown) => void
}

const ZONE_OPTIONS = timeZones().map((zone) => ({ value: zone, label: zone }))
const PRESET_OPTIONS = [
  { value: '', label: 'Preset' },
  ...SCHEDULE_PRESETS.map((preset) => ({ value: preset.cron, label: preset.label })),
]

const paramsKey = (params: unknown) => (params === undefined ? '' : JSON.stringify(params))

/** The schedules of a deployment: each a cron expression, its timezone and the params its runs get. */
export function ScheduleList({ label, placeholder, items, onChange }: ScheduleListProps) {
  if (items.length === 0) return null
  return (
    <ul className="flex flex-col gap-3">
      {items.map((_, index) => (
        <ScheduleRow
          key={index}
          index={index}
          label={label}
          placeholder={placeholder}
          items={items}
          onChange={onChange}
        />
      ))}
    </ul>
  )
}

function ScheduleRow({
  index,
  label,
  placeholder,
  items,
  onChange,
}: ScheduleListProps & { index: number }) {
  const entry = items[index] ?? ''
  const details = typeof entry === 'string' ? { cron: entry } : entry
  const name = `${label} ${index + 1}`
  // What was typed, with the params it stands for: shown only while the entry
  // still has those, so a row never shows another schedule's text.
  const [typed, setTyped] = useState<{ text: string; standsFor: string } | null>(null)
  const current = paramsKey(details.params)
  const paramsText =
    typed && typed.standsFor === current
      ? typed.text
      : details.params === undefined
        ? ''
        : JSON.stringify(details.params, null, 2)
  const [paramsOpen, setParamsOpen] = useState(details.params !== undefined)
  const paramsValid = paramsFromText(paramsText).ok
  const reading = readSchedule(entry, Date.now())

  function replace(next: ScheduleEntry) {
    onChange(items.map((item, j) => (j === index ? next : item)))
  }

  function handleCron(e: ChangeEvent<HTMLInputElement>) {
    replace(entryWith(entry, { cron: e.target.value }))
  }

  function handlePreset(cron: string) {
    if (cron !== '') replace(entryWith(entry, { cron }))
  }

  function handleZone(timezone: string) {
    replace(entryWith(entry, { timezone }))
  }

  function handleParams(e: ChangeEvent<HTMLTextAreaElement>) {
    const text = e.target.value
    const parsed = paramsFromText(text)
    // Text that is not JSON yet leaves the entry as it is.
    setTyped({ text, standsFor: parsed.ok ? paramsKey(parsed.params) : current })
    if (parsed.ok) replace(entryWith(entry, { params: parsed.params }))
  }

  function handleToggleParams() {
    setParamsOpen((open) => !open)
  }

  function handleRemove() {
    const rest = items.filter((_, j) => j !== index)
    onChange(rest.length > 0 ? rest : undefined)
  }

  return (
    <li className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label={name}
          className="min-w-[160px] flex-1 font-mono text-xs"
          value={details.cron}
          placeholder={placeholder}
          onChange={handleCron}
        />
        <Select
          aria-label={`${name} preset`}
          className="w-32 text-xs"
          value=""
          onValueChange={handlePreset}
          options={PRESET_OPTIONS}
        />
        <SearchableSelect
          label="Timezone"
          value={details.timezone ?? 'UTC'}
          onChange={handleZone}
          options={ZONE_OPTIONS}
          searchPlaceholder="Search timezones"
        />
        <Button type="button" variant="ghost" size="sm" onClick={handleToggleParams}>
          Params
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={`Remove ${details.cron || name}`}
          className="text-status-error hover:text-status-error"
          onClick={handleRemove}
        >
          Remove
        </Button>
      </div>
      {reading.state === 'problem' && (
        <p role="alert" className="text-xs text-status-error">
          {reading.problem}
        </p>
      )}
      {reading.state === 'ok' && (
        <p className="text-xs text-muted-foreground">Next: {reading.next.join(' · ')}</p>
      )}
      {paramsOpen && (
        <div className="flex flex-col gap-1">
          <Textarea
            aria-label={`${name} params`}
            aria-invalid={!paramsValid}
            className="min-h-[60px] font-mono text-xs"
            value={paramsText}
            placeholder='{ "source": "schedule" }'
            onChange={handleParams}
          />
          <p className={`text-xs ${paramsValid ? 'text-muted-foreground' : 'text-status-error'}`}>
            {paramsValid ? 'JSON given to each run this schedule starts.' : 'This is not JSON yet.'}
          </p>
        </div>
      )}
    </li>
  )
}
