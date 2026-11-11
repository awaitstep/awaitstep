import { useId, type ChangeEvent, type ReactNode } from 'react'
import { Plus } from 'lucide-react'
import type { DeploymentConfigUiField } from '@awaitstep/codegen'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Select } from '../ui/select'
import { Switch } from '../ui/switch'
import { Textarea } from '../ui/textarea'
import { switchedOn } from './config-paths'

interface SettingFieldProps {
  field: DeploymentConfigUiField
  value: unknown
  onChange: (value: unknown) => void
}

interface ControlProps<T> {
  id: string
  label: string
  placeholder?: string
  value: T
  onChange: (value: unknown) => void
}

type RouteItem = { pattern?: string; zoneName?: string }

function labelOf(field: DeploymentConfigUiField): string {
  return field.label ?? field.path.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase())
}

/** A list emptied of its last item is unset, as the schema stores it. */
function listOrUnset<T>(items: T[]): T[] | undefined {
  return items.length > 0 ? items : undefined
}

/** Blank text is unset. */
function textOrUnset(text: string): string | undefined {
  return text === '' ? undefined : text
}

/**
 * One setting in an open group on Deploy (25b): its name and a short line on
 * the left, the control on the right; a list's items below.
 */
export function SettingField({ field, value, onChange }: SettingFieldProps) {
  const id = useId()
  const label = labelOf(field)
  const common = { id, label, placeholder: field.placeholder, onChange }
  const isList = field.widget === 'array' || field.widget === 'array-of-objects'

  let control: ReactNode = null
  let below: ReactNode = null
  if (field.widget === 'boolean') {
    control = (
      <Switch
        id={id}
        checked={switchedOn(value, field.offObject)}
        onCheckedChange={onChange}
        label={label}
      />
    )
  } else if (field.widget === 'select' && field.options) {
    control = <SelectControl {...common} value={value} options={field.options} />
  } else if (field.widget === 'number') {
    control = <NumberControl {...common} value={value} />
  } else if (field.widget === 'textarea') {
    below = <TextareaControl {...common} value={value} />
  } else if (field.widget === 'array') {
    const items = Array.isArray(value) ? (value as string[]) : []
    control = <AddButton label={label} items={items} blank="" onChange={onChange} />
    below = <StringList {...common} value={items} />
  } else if (field.widget === 'array-of-objects') {
    const items = Array.isArray(value) ? (value as RouteItem[]) : []
    control = (
      <AddButton
        label={label}
        items={items}
        blank={{ pattern: '', zoneName: '' }}
        onChange={onChange}
      />
    )
    below = <RouteList {...common} value={items} />
  } else {
    control = <TextControl {...common} value={value} />
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-3.5">
        <span className="flex min-w-[200px] flex-1 flex-col gap-0.5">
          {isList ? (
            // A list has no one control to label: its Add and items name it themselves.
            <span className="text-[13px] font-medium text-foreground">{label}</span>
          ) : (
            <label htmlFor={id} className="text-[13px] font-medium text-foreground">
              {label}
            </label>
          )}
          {field.help && <span className="text-xs text-muted-foreground">{field.help}</span>}
        </span>
        {control}
      </div>
      {below}
    </div>
  )
}

function SelectControl({
  id,
  value,
  options,
  onChange,
}: ControlProps<unknown> & { options: NonNullable<DeploymentConfigUiField['options']> }) {
  function handleChange(next: string) {
    onChange(textOrUnset(next))
  }
  return (
    <Select
      id={id}
      className="w-48"
      value={typeof value === 'string' ? value : ''}
      onValueChange={handleChange}
      options={options}
    />
  )
}

function NumberControl({ id, value, placeholder, onChange }: ControlProps<unknown>) {
  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    onChange(e.target.value === '' ? undefined : Number(e.target.value))
  }
  return (
    <Input
      id={id}
      type="number"
      className="w-36"
      value={typeof value === 'number' ? String(value) : ''}
      placeholder={placeholder}
      onChange={handleChange}
    />
  )
}

function TextControl({ id, value, placeholder, onChange }: ControlProps<unknown>) {
  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    onChange(textOrUnset(e.target.value))
  }
  return (
    <Input
      id={id}
      className="w-40"
      value={typeof value === 'string' ? value : ''}
      placeholder={placeholder}
      onChange={handleChange}
    />
  )
}

function TextareaControl({ id, value, placeholder, onChange }: ControlProps<unknown>) {
  function handleChange(e: ChangeEvent<HTMLTextAreaElement>) {
    onChange(textOrUnset(e.target.value))
  }
  return (
    <Textarea
      id={id}
      className="min-h-[60px]"
      value={typeof value === 'string' ? value : ''}
      placeholder={placeholder}
      onChange={handleChange}
    />
  )
}

function AddButton<T>({
  label,
  items,
  blank,
  onChange,
}: {
  label: string
  items: T[]
  blank: T
  onChange: (value: unknown) => void
}) {
  function handleAdd() {
    onChange([...items, blank])
  }
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      aria-label={`Add to ${label}`}
      onClick={handleAdd}
    >
      <Plus aria-hidden="true" className="size-3" />
      Add
    </Button>
  )
}

function RemoveButton({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      aria-label={label}
      className="text-status-error hover:text-status-error"
      onClick={onRemove}
    >
      Remove
    </Button>
  )
}

function StringList({ label, value: items, placeholder, onChange }: ControlProps<string[]>) {
  if (items.length === 0) return null
  return (
    <ul className="flex flex-col gap-2">
      {items.map((item, i) => (
        <StringItem
          key={i}
          index={i}
          label={label}
          items={items}
          placeholder={placeholder}
          onChange={onChange}
        />
      ))}
    </ul>
  )
}

function StringItem({
  index,
  label,
  items,
  placeholder,
  onChange,
}: {
  index: number
  label: string
  items: string[]
  placeholder?: string
  onChange: (value: unknown) => void
}) {
  const item = items[index] ?? ''

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    onChange(items.map((v, j) => (j === index ? e.target.value : v)))
  }

  function handleRemove() {
    onChange(listOrUnset(items.filter((_, j) => j !== index)))
  }

  return (
    <li className="flex items-center gap-2">
      <Input
        aria-label={`${label} ${index + 1}`}
        className="flex-1 font-mono text-xs"
        value={item}
        placeholder={placeholder}
        onChange={handleChange}
      />
      <RemoveButton label={`Remove ${item || `${label} ${index + 1}`}`} onRemove={handleRemove} />
    </li>
  )
}

function RouteList({ value: items, onChange }: ControlProps<RouteItem[]>) {
  if (items.length === 0) return null
  return (
    <ul className="flex flex-col gap-2">
      {items.map((_, i) => (
        <RouteRow key={i} index={i} items={items} onChange={onChange} />
      ))}
    </ul>
  )
}

function RouteRow({
  index,
  items,
  onChange,
}: {
  index: number
  items: RouteItem[]
  onChange: (value: unknown) => void
}) {
  const item = items[index] ?? {}

  function update(key: keyof RouteItem, text: string) {
    onChange(items.map((row, j) => (j === index ? { ...row, [key]: text } : row)))
  }

  function handlePattern(e: ChangeEvent<HTMLInputElement>) {
    update('pattern', e.target.value)
  }

  function handleZone(e: ChangeEvent<HTMLInputElement>) {
    update('zoneName', e.target.value)
  }

  function handleRemove() {
    onChange(listOrUnset(items.filter((_, j) => j !== index)))
  }

  return (
    <li className="flex flex-wrap items-center gap-2">
      <Input
        aria-label={`Route ${index + 1} pattern`}
        className="min-w-[160px] flex-1 font-mono text-xs"
        value={item.pattern ?? ''}
        placeholder="example.com/*"
        onChange={handlePattern}
      />
      <Input
        aria-label={`Route ${index + 1} zone`}
        className="min-w-[140px] flex-1 font-mono text-xs"
        value={item.zoneName ?? ''}
        placeholder="example.com"
        onChange={handleZone}
      />
      <RemoveButton label={`Remove route ${index + 1}`} onRemove={handleRemove} />
    </li>
  )
}
