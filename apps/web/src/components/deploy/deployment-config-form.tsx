import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Select } from '../ui/select'
import { Separator } from '../ui/separator'
import { cn } from '../../lib/utils'
import {
  buildDefaults,
  isVisible,
  readPath,
  writePath,
  type DefaultsByPath,
  type UiFieldLike,
} from './config-paths'

interface UiField extends UiFieldLike {
  label?: string
  help?: string
  placeholder?: string
  widget?: string
  options?: Array<{ value: string; label: string }>
}

interface UiGroup {
  title: string
  description?: string
  fields: UiField[]
}

interface UiSchema {
  groups: UiGroup[]
}

interface DeploymentConfigFormProps {
  uiSchema: UiSchema
  config: Record<string, unknown>
  onChange: (config: Record<string, unknown>) => void
}

export function DeploymentConfigForm({ uiSchema, config, onChange }: DeploymentConfigFormProps) {
  const defaults = buildDefaults(uiSchema)

  function handleFieldChange(path: string, value: unknown) {
    onChange(writePath(config, path, value, defaults))
  }

  return (
    <div className="space-y-8">
      {uiSchema.groups.map((group, i) => {
        const visibleFields = group.fields.filter((f) => isVisible(f, config, defaults))
        if (visibleFields.length === 0) return null
        const normal = visibleFields.filter((f) => !f.advanced)
        const advanced = visibleFields.filter((f) => f.advanced)
        return (
          <div key={group.title}>
            {i > 0 && <Separator className="mb-8" />}
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-semibold text-foreground">{group.title}</h3>
                {group.description && (
                  <p className="text-xs text-muted-foreground/60">{group.description}</p>
                )}
              </div>
              <div className="space-y-3">
                {normal.map((field) => (
                  <ConfigField
                    key={field.path}
                    field={field}
                    value={readPath(config, field.path, defaults)}
                    onChange={(v) => handleFieldChange(field.path, v)}
                  />
                ))}
              </div>
              {advanced.length > 0 && (
                <AdvancedSection
                  fields={advanced}
                  config={config}
                  defaults={defaults}
                  onFieldChange={handleFieldChange}
                />
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function AdvancedSection({
  fields,
  config,
  defaults,
  onFieldChange,
}: {
  fields: UiField[]
  config: Record<string, unknown>
  defaults: DefaultsByPath
  onFieldChange: (path: string, value: unknown) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="pt-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        Advanced
      </button>
      {open && (
        <div className="mt-3 space-y-3">
          {fields.map((field) => (
            <ConfigField
              key={field.path}
              field={field}
              value={readPath(config, field.path, defaults)}
              onChange={(v) => onFieldChange(field.path, v)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ConfigField({
  field,
  value,
  onChange,
}: {
  field: UiField
  value: unknown
  onChange: (v: unknown) => void
}) {
  const label = field.label ?? humanize(field.path)

  if (field.widget === 'select' && field.options) {
    return (
      <div className="space-y-1.5">
        <Label className="text-sm font-medium text-foreground">{label}</Label>
        <Select
          className="max-w-xs"
          value={(value as string) ?? ''}
          onValueChange={(v) => onChange(v || undefined)}
          options={field.options.map((o) => ({ value: o.value, label: o.label }))}
        />
        {field.help && <p className="text-xs text-muted-foreground/50">{field.help}</p>}
      </div>
    )
  }

  if (field.widget === 'boolean') {
    return (
      <div className="flex items-center justify-between gap-3">
        <div>
          <span className="text-sm font-medium text-foreground">{label}</span>
          {field.help && <p className="text-xs text-muted-foreground/50">{field.help}</p>}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={!!value}
          onClick={() => onChange(!value)}
          className={cn(
            'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors',
            value ? 'bg-primary' : 'bg-muted',
          )}
        >
          <span
            className={cn(
              'pointer-events-none block h-4 w-4 rounded-full bg-white shadow-sm transition-transform',
              value ? 'translate-x-4' : 'translate-x-0',
            )}
          />
        </button>
      </div>
    )
  }

  if (field.widget === 'textarea') {
    return (
      <div className="space-y-1.5">
        <Label className="text-sm font-medium text-foreground">{label}</Label>
        <textarea
          className="flex min-h-[60px] max-w-xs w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          value={(value as string) ?? ''}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value || undefined)}
        />
        {field.help && <p className="text-xs text-muted-foreground/50">{field.help}</p>}
      </div>
    )
  }

  if (field.widget === 'array-of-objects') {
    return <ArrayOfObjectsField field={field} value={value} onChange={onChange} />
  }

  if (field.widget === 'array') {
    return <StringArrayField field={field} value={value} onChange={onChange} />
  }

  if (field.widget === 'number') {
    return (
      <div className="space-y-1.5">
        <Label className="text-sm font-medium text-foreground">{label}</Label>
        <Input
          className="max-w-[200px]"
          type="number"
          value={value != null ? String(value) : ''}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value ? Number(e.target.value) : undefined)}
        />
        {field.help && <p className="text-xs text-muted-foreground/50">{field.help}</p>}
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium text-foreground">{label}</Label>
      <Input
        className="max-w-xs"
        value={(value as string) ?? ''}
        placeholder={field.placeholder}
        onChange={(e) => onChange(e.target.value || undefined)}
      />
      {field.help && <p className="text-xs text-muted-foreground/50">{field.help}</p>}
    </div>
  )
}

function ArrayOfObjectsField({
  field,
  value,
  onChange,
}: {
  field: UiField
  value: unknown
  onChange: (v: unknown) => void
}) {
  const items = (Array.isArray(value) ? value : []) as Array<Record<string, string>>
  const label = field.label ?? humanize(field.path)

  function handleItemChange(index: number, key: string, val: string) {
    const updated = items.map((item, i) => (i === index ? { ...item, [key]: val } : item))
    onChange(updated.length > 0 ? updated : undefined)
  }

  function addItem() {
    onChange([...items, { pattern: '', zoneName: '' }])
  }

  function removeItem(index: number) {
    const updated = items.filter((_, i) => i !== index)
    onChange(updated.length > 0 ? updated : undefined)
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium text-foreground">{label}</Label>
        <button type="button" onClick={addItem} className="text-xs text-primary hover:underline">
          + Add route
        </button>
      </div>
      {items.map((item, i) => (
        <div key={i} className="flex items-start gap-2">
          <Input
            value={item.pattern ?? ''}
            placeholder="example.com/*"
            className="flex-1"
            onChange={(e) => handleItemChange(i, 'pattern', e.target.value)}
          />
          <Input
            value={item.zoneName ?? ''}
            placeholder="example.com"
            className="flex-1"
            onChange={(e) => handleItemChange(i, 'zoneName', e.target.value)}
          />
          <button
            type="button"
            onClick={() => removeItem(i)}
            className="mt-2 text-xs text-muted-foreground hover:text-foreground"
          >
            Remove
          </button>
        </div>
      ))}
      {field.help && <p className="text-xs text-muted-foreground/50">{field.help}</p>}
    </div>
  )
}

function StringArrayField({
  field,
  value,
  onChange,
}: {
  field: UiField
  value: unknown
  onChange: (v: unknown) => void
}) {
  const items = (Array.isArray(value) ? value : []) as string[]
  const label = field.label ?? humanize(field.path)

  function handleItemChange(index: number, val: string) {
    const updated = items.map((item, i) => (i === index ? val : item))
    onChange(updated.length > 0 ? updated : undefined)
  }

  function addItem() {
    onChange([...items, ''])
  }

  function removeItem(index: number) {
    const updated = items.filter((_, i) => i !== index)
    onChange(updated.length > 0 ? updated : undefined)
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium text-foreground">{label}</Label>
        <button type="button" onClick={addItem} className="text-xs text-primary hover:underline">
          + Add
        </button>
      </div>
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            value={item}
            placeholder={field.placeholder}
            className="flex-1"
            onChange={(e) => handleItemChange(i, e.target.value)}
          />
          <button
            type="button"
            onClick={() => removeItem(i)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Remove
          </button>
        </div>
      ))}
      {field.help && <p className="text-xs text-muted-foreground/50">{field.help}</p>}
    </div>
  )
}

function humanize(path: string): string {
  return path.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase())
}
