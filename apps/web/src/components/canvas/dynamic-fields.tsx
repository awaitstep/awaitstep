import { useState, useEffect } from 'react'
import type { ConfigField } from '@awaitstep/ir'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Select } from '../ui/select'
import { formatDate } from '../../lib/time'
import { CodeEditor } from '../ui/code-editor'
import { DateTimePicker } from '../ui/datetime-picker'
import { cn } from '../../lib/utils'

interface DynamicFieldsProps {
  configSchema: Record<string, ConfigField>
  data: Record<string, unknown>
  onChange: (fieldId: string, value: unknown) => void
}

export function DynamicFields({ configSchema, data, onChange }: DynamicFieldsProps) {
  return (
    <div className="space-y-4">
      {Object.entries(configSchema).map(([fieldId, field]) => (
        <DynamicField
          key={fieldId}
          field={field}
          value={data[fieldId]}
          onChange={(value) => onChange(fieldId, value)}
        />
      ))}
    </div>
  )
}

interface DynamicFieldProps {
  field: ConfigField
  value: unknown
  onChange: (value: unknown) => void
}

function DynamicField({ field, value, onChange }: DynamicFieldProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-[11px] text-muted-foreground">
          {field.label}
          {field.required && <span className="ml-0.5 text-destructive">*</span>}
        </Label>
      </div>
      <FieldRenderer field={field} value={value} onChange={onChange} />
      {field.description && (
        <p className="text-[10px] text-muted-foreground/60">{field.description}</p>
      )}
    </div>
  )
}

function FieldRenderer({ field, value, onChange }: DynamicFieldProps) {
  const stringValue = String(value ?? '')

  switch (field.type) {
    case 'string': {
      if (field.validation?.format === 'duration') {
        return <DurationInput value={stringValue} onChange={onChange} />
      }
      if (field.validation?.format === 'date-time') {
        return <DateTimeField value={stringValue} onChange={onChange} />
      }
      return (
        <Input
          value={stringValue}
          onChange={(e) => onChange(e.target.value)}
          debounceMs={300}
          placeholder={field.placeholder}
          maxLength={field.validation?.maxLength}
        />
      )
    }

    case 'number':
      return (
        <Input
          type="number"
          value={value !== undefined && value !== null ? String(value) : ''}
          onChange={(e) => onChange(e.target.value ? Number(e.target.value) : undefined)}
          debounceMs={300}
          placeholder={field.placeholder}
          min={field.validation?.min}
          max={field.validation?.max}
        />
      )

    case 'boolean':
      return (
        <button
          type="button"
          role="switch"
          aria-checked={Boolean(value ?? field.default)}
          onClick={() => onChange(!(value ?? field.default))}
          className={cn(
            'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors',
            (value ?? field.default) ? 'bg-primary' : 'bg-muted',
          )}
        >
          <span
            className={cn(
              'pointer-events-none block h-5 w-5 rounded-full bg-white shadow-sm transition-transform',
              (value ?? field.default) ? 'translate-x-5' : 'translate-x-0',
            )}
          />
        </button>
      )

    case 'select':
      return (
        <Select
          value={String(value ?? field.default ?? '')}
          onValueChange={onChange}
          options={(field.options ?? []).map((opt) => ({ value: opt, label: opt }))}
          className="w-full"
        />
      )

    case 'multiselect': {
      const selected = Array.isArray(value) ? value as string[] : []
      return (
        <div className="flex flex-wrap gap-1.5">
          {(field.options ?? []).map((opt) => {
            const isSelected = selected.includes(opt)
            return (
              <button
                key={opt}
                type="button"
                onClick={() => {
                  onChange(isSelected ? selected.filter((v) => v !== opt) : [...selected, opt])
                }}
                className={cn(
                  'rounded-md border px-2 py-1 text-[11px] transition-colors',
                  isSelected
                    ? 'border-primary/40 bg-primary/10 text-primary'
                    : 'border-border bg-transparent text-muted-foreground hover:bg-muted/60',
                )}
              >
                {opt}
              </button>
            )
          })}
        </div>
      )
    }

    case 'secret':
      return (
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50">
            <path fillRule="evenodd" d="M8 1a3.5 3.5 0 0 0-3.5 3.5V7A1.5 1.5 0 0 0 3 8.5v5A1.5 1.5 0 0 0 4.5 15h7a1.5 1.5 0 0 0 1.5-1.5v-5A1.5 1.5 0 0 0 11.5 7V4.5A3.5 3.5 0 0 0 8 1Zm2 6V4.5a2 2 0 1 0-4 0V7h4Z" clipRule="evenodd" />
          </svg>
          <span className="font-mono text-sm text-muted-foreground">{field.envVarName}</span>
          <span className="ml-auto text-[10px] text-muted-foreground/40">from env</span>
        </div>
      )

    case 'code':
      return (
        <CodeEditor
          value={stringValue || String(field.default ?? '')}
          onChange={(v) => onChange(v)}
          debounceMs={300}
          language="typescript"
          height="160px"
        />
      )

    case 'json': {
      const jsonValue = value != null && typeof value === 'object'
        ? JSON.stringify(value, null, 2)
        : String(value ?? field.default ?? '')
      return (
        <CodeEditor
          value={jsonValue}
          onChange={(v) => {
            try { onChange(v ? JSON.parse(v) : undefined) } catch { onChange(v) }
          }}
          debounceMs={300}
          language="json"
          height="120px"
        />
      )
    }

    case 'expression':
      return (
        <Input
          value={stringValue}
          onChange={(e) => onChange(e.target.value)}
          debounceMs={300}
          placeholder={field.placeholder ?? 'e.g. step_result.fieldName'}
          className="font-mono"
        />
      )

    case 'textarea':
      return (
        <textarea
          value={stringValue}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          rows={4}
          className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        />
      )

    default:
      return (
        <Input
          value={stringValue}
          onChange={(e) => onChange(e.target.value)}
          debounceMs={300}
          placeholder={field.placeholder}
        />
      )
  }
}

// ── Duration picker (number + unit) ──

const DURATION_UNITS = ['second', 'minute', 'hour', 'day'] as const
const MAX_SECONDS = 365 * 86400
const UNIT_TO_SECONDS: Record<string, number> = { second: 1, minute: 60, hour: 3600, day: 86400 }

function parseDurationValue(value: string): { amount: number; unit: string } {
  if (!value) return { amount: 0, unit: 'second' }
  const match = value.match(/^(\d+)\s*(.+?)s?$/)
  if (!match) return { amount: 0, unit: 'second' }
  const unit = match[2]!
  return { amount: Number(match[1]), unit: DURATION_UNITS.includes(unit as typeof DURATION_UNITS[number]) ? unit : 'second' }
}

function clampDuration(amount: number, unit: string): number {
  const unitSeconds = UNIT_TO_SECONDS[unit] ?? 1
  const maxForUnit = Math.floor(MAX_SECONDS / unitSeconds)
  return Math.min(Math.max(1, amount), maxForUnit)
}

function DurationInput({ value, onChange }: { value: string; onChange: (value: unknown) => void }) {
  const { amount, unit } = parseDurationValue(value)
  const maxForUnit = Math.floor(MAX_SECONDS / (UNIT_TO_SECONDS[unit] ?? 1))
  const [localAmount, setLocalAmount] = useState(String(amount || ''))

  useEffect(() => {
    setLocalAmount(String(amount || ''))
  }, [amount])

  return (
    <div className="flex gap-2">
      <Input
        type="number"
        min={1}
        max={maxForUnit}
        value={localAmount}
        onChange={(e) => setLocalAmount(e.target.value)}
        onBlur={() => {
          const num = Number(localAmount)
          if (!localAmount.trim() || isNaN(num) || num <= 0) {
            onChange('')
            return
          }
          const clamped = clampDuration(num, unit)
          setLocalAmount(String(clamped))
          onChange(`${clamped} ${unit}`)
        }}
        placeholder="10"
        className="flex-1"
      />
      <Select
        value={unit}
        onValueChange={(v) => {
          const num = Number(localAmount) || 10
          const clamped = clampDuration(num, v)
          setLocalAmount(String(clamped))
          onChange(`${clamped} ${v}`)
        }}
        options={DURATION_UNITS.map((u) => ({ value: u, label: u }))}
        className="w-28"
      />
    </div>
  )
}

// ── DateTime picker ──

function DateTimeField({ value, onChange }: { value: string; onChange: (value: unknown) => void }) {
  const minDateTime = new Date(Date.now() + 60 * 60 * 1000)
  const selectedDate = value ? new Date(value) : null
  const isPast = selectedDate && selectedDate < minDateTime

  return (
    <div className="space-y-1.5">
      <DateTimePicker
        value={selectedDate}
        minDate={minDateTime}
        onChange={(date) => onChange(date ? date.toISOString() : '')}
        placeholder="Pick a date & time"
      />
      {isPast && (
        <p className="text-[11px] text-destructive">Selected time is in the past. Must be at least 1 hour from now.</p>
      )}
      {selectedDate && !isPast && (
        <div className="rounded-lg bg-muted/40 px-2.5 py-2 text-[11px] text-muted-foreground/60">
          Will resume at {formatDate(selectedDate)}
        </div>
      )}
    </div>
  )
}
