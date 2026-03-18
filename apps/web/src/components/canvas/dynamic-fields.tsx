import type { ConfigField } from '@awaitstep/ir'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Select } from '../ui/select'
import { CodeEditor } from '../ui/code-editor'
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
  fieldId: string
  field: ConfigField
  value: unknown
  onChange: (value: unknown) => void
}

function DynamicField({ field, value, onChange }: Omit<DynamicFieldProps, 'fieldId'>) {
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

function FieldRenderer({ field, value, onChange }: Omit<DynamicFieldProps, 'fieldId'>) {
  switch (field.type) {
    case 'string':
      return (
        <Input
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          maxLength={field.validation?.maxLength}
        />
      )

    case 'number':
      return (
        <Input
          type="number"
          value={value !== undefined && value !== null ? String(value) : ''}
          onChange={(e) => onChange(e.target.value ? Number(e.target.value) : undefined)}
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
        <Input
          value={String(value ?? field.envVarName ?? '')}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.envVarName ?? 'ENV_VAR_NAME'}
          className="font-mono"
        />
      )

    case 'code':
      return (
        <CodeEditor
          value={String(value ?? field.default ?? '')}
          onChange={onChange}
          language="typescript"
          height="160px"
        />
      )

    case 'json':
      return (
        <CodeEditor
          value={String(value ?? field.default ?? '')}
          onChange={onChange}
          language="json"
          height="120px"
        />
      )

    case 'expression':
      return (
        <Input
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder ?? 'e.g. step_result.fieldName'}
          className="font-mono"
        />
      )

    case 'textarea':
      return (
        <textarea
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          rows={4}
          className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        />
      )

    default:
      return (
        <Input
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
        />
      )
  }
}
