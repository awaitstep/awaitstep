import { useId } from 'react'
import type { WorkflowNode } from '@awaitstep/ir'
import {
  EXPORTABLE_NODE_TYPES,
  isExportedName,
  isExportedNode,
  isValidExportKey,
} from '@awaitstep/codegen'
import type { StepScope } from '../../lib/step-scope'
import { FormField } from '../ui/form-field'
import { Input } from '../ui/input'
import { Switch } from '../ui/switch'

type Kind = 'workflow' | 'script'

interface ExportFieldsProps {
  node: WorkflowNode
  kind: Kind
  /** What the node's value is called, and whether the graph returns it. */
  scope: StepScope
  onChange: (fieldId: string, value: unknown) => void
}

/**
 * The response row: whether a function returns this node's value, and the key
 * it comes back under. A workflow has no response, so the row is absent there.
 * Kinds start at their own default — a step and an HTTP call off, a
 * sub-workflow and a sub-script on — and the switch writes the override.
 */
export function ExportFields({ node, kind, scope, onChange }: ExportFieldsProps) {
  const idBase = useId()
  const exportId = `${idBase}-export`
  const exportKeyId = `${idBase}-export-key`
  // The legacy name prefix returns the value on its own; the switch shows that and stays put.
  const returnedByName = isExportedName(node.name)
  const switchedOn = isExportedNode(node)
  const exportAs = typeof node.data.exportAs === 'string' ? node.data.exportAs : ''
  const exportKeyInvalid = exportAs !== '' && !isValidExportKey(exportAs)
  // A step's value exists only when its body returns one; other kinds always
  // bind a value (an HTTP response, a sub-workflow handle).
  const returnsNothing = node.type === 'step' && switchedOn && !scope.returned

  // A workflow has no response and a sleep has no value: only a function, and
  // only a kind whose value can be returned at all.
  if (kind !== 'script' || !EXPORTABLE_NODE_TYPES.has(node.type)) return null

  function handleExportChange(checked: boolean) {
    onChange('export', checked)
  }

  function handleExportKeyChange(event: React.ChangeEvent<HTMLInputElement>) {
    const value = event.target.value.trim()
    onChange('exportAs', value === '' ? undefined : value)
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2.5">
        <Switch
          id={exportId}
          checked={switchedOn}
          onCheckedChange={handleExportChange}
          label="Return this value"
          disabledReason={
            returnedByName
              ? 'Returned by the EXPORT_ name prefix; rename the node to change this.'
              : undefined
          }
        />
        <label htmlFor={exportId} className="min-w-0 cursor-pointer">
          <div className="text-xs text-foreground">Return this value</div>
          <div className="text-[11px] text-muted-foreground/60">
            {returnsNothing && scope.status === 'ok' ? (
              'Returns nothing yet: the body has no return.'
            ) : (
              <>
                {scope.returned ? 'In the response as ' : 'Would be in the response as '}
                <code className="font-mono text-foreground/70">{scope.exportKey}</code>
              </>
            )}
          </div>
        </label>
      </div>
      {switchedOn && !returnedByName && (
        <FormField
          label="Response key"
          id={exportKeyId}
          error={
            exportKeyInvalid ? (
              <>
                Letters, digits and _ only; cannot start with a digit. Using{' '}
                <code className="font-mono">{scope.varName}</code>.
              </>
            ) : undefined
          }
        >
          <Input
            id={exportKeyId}
            value={exportAs}
            onChange={handleExportKeyChange}
            debounceMs={300}
            placeholder={scope.varName}
            className="h-8 font-mono text-xs"
          />
        </FormField>
      )}
    </div>
  )
}
