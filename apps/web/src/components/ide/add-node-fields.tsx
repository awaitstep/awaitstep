import type { NodeDefinition } from '@awaitstep/ir'
import { useNodeRegistry } from '../../contexts/node-registry-context'
import { getNodeVisuals } from '../../lib/node-icon-map'
import { cn } from '../../lib/utils'
import { DynamicFields } from '../canvas/dynamic-fields'
import { InlineSwitch } from '../canvas/inline-switch'
import { Button } from '../ui/button'
import { FormField } from '../ui/form-field'
import { Input } from '../ui/input'

interface AddNodeFieldsProps {
  definition: NodeDefinition
  name: string
  data: Record<string, unknown>
  error: string | null
  onNameChange: (name: string) => void
  onFieldChange: (fieldId: string, value: unknown) => void
  /** Back to the list to pick another node. */
  onChangeNode: () => void
  /** A save is in flight: nothing here can change until it settles. */
  busy: boolean
}

/**
 * The picked custom node, as a canvas drop would start it: its name, its
 * fields (required ones marked) and whether it runs Inline. Required fields
 * left empty are reported by validation and Deploy, as on the canvas.
 */
export function AddNodeFields({
  definition,
  name,
  data,
  error,
  onNameChange,
  onFieldChange,
  onChangeNode,
  busy,
}: AddNodeFieldsProps) {
  const { customNodes } = useNodeRegistry()
  const visuals = getNodeVisuals(definition.id, definition.icon)
  const source = customNodes.get(definition.id)
  const origin = source
    ? `${source.owner === 'project' ? 'Project · ' : ''}v${source.version}`
    : `Marketplace · v${definition.version}`
  const hasFields = Object.keys(definition.configSchema).length > 0

  function handleNameChange(event: React.ChangeEvent<HTMLInputElement>) {
    onNameChange(event.target.value)
  }

  function handleInlineChange(checked: boolean) {
    // Unset rather than false, as the canvas stores it.
    onFieldChange('inline', checked ? true : undefined)
  }

  return (
    <fieldset disabled={busy} className="min-w-0 space-y-4">
      <div className="flex items-center gap-2.5 rounded-lg border border-border px-2.5 py-2">
        <span
          className={cn(
            'flex h-7 w-7 shrink-0 items-center justify-center rounded-md',
            visuals.accent,
          )}
          aria-hidden
        >
          {visuals.paletteIcon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-foreground">{definition.name}</p>
          <p className="truncate text-2xs text-muted-foreground">{origin}</p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onChangeNode}>
          Change
        </Button>
      </div>

      <FormField label="Name" error={error}>
        <Input
          autoFocus
          aria-label="Node name"
          value={name}
          maxLength={256}
          onChange={handleNameChange}
          placeholder={definition.name}
          className="h-9"
        />
      </FormField>

      {hasFields && (
        <DynamicFields
          configSchema={definition.configSchema}
          data={data}
          onChange={onFieldChange}
        />
      )}

      <InlineSwitch checked={data.inline === true} onChange={handleInlineChange} />
    </fieldset>
  )
}
