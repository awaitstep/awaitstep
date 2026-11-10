import { useId, useState } from 'react'
import type { ConfigField, WorkflowNode } from '@awaitstep/ir'
import { FormField } from '../ui/form-field'
import {
  SegmentedTab,
  SegmentedTabList,
  SegmentedTabPanel,
  SegmentedTabs,
} from '../ui/segmented-tabs'
import { Switch } from '../ui/switch'
import { FieldRenderer, fieldTakesId } from './dynamic-fields'

/** Methods a request body is sent with. A GET or HEAD body is not offered. */
const METHODS_WITH_BODY = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

/** The execution fields the durable section lays out as a pair. */
const DURABLE_FIELDS = ['retryLimit', 'timeout'] as const

interface HttpRequestFieldsProps {
  node: WorkflowNode
  /** The HTTP node's config schema: method, url, headers, queryParams, body, retryLimit, timeout. */
  schema: Record<string, ConfigField>
  onChange: (fieldId: string, value: unknown) => void
  readOnly?: boolean
}

/**
 * An HTTP node's body: the target, then the parts of the request in tabs so the
 * panel does not grow a code editor per field. The Body tab appears only for a
 * method that sends one. The request runs without a step unless the node is
 * marked durable.
 */
export function HttpRequestFields({
  node,
  schema,
  onChange,
  readOnly = false,
}: HttpRequestFieldsProps) {
  const idBase = useId()
  const durableId = `${idBase}-durable`
  const [tab, setTab] = useState('headers')
  const method = String(node.data.method ?? 'GET')
  const bodyAllowed = METHODS_WITH_BODY.has(method)
  // A method that cannot carry a body leaves that tab hidden; do not open it.
  const activeTab = !bodyAllowed && tab === 'body' ? 'headers' : tab
  const durable = node.data.durable === true
  const { method: methodField, url: urlField } = schema

  function handleDurableChange(checked: boolean) {
    onChange('durable', checked)
  }

  return (
    <div className="space-y-4">
      {methodField && (
        <FormField
          label={methodField.label}
          required={methodField.required}
          id={`${idBase}-method`}
        >
          <FieldRenderer
            id={`${idBase}-method`}
            field={methodField}
            value={node.data.method}
            onChange={(value) => onChange('method', value)}
            readOnly={readOnly}
          />
        </FormField>
      )}

      {urlField && (
        <FormField label={urlField.label} required={urlField.required} id={`${idBase}-url`}>
          <FieldRenderer
            id={`${idBase}-url`}
            field={urlField}
            value={node.data.url}
            onChange={(value) => onChange('url', value)}
            readOnly={readOnly}
          />
        </FormField>
      )}

      <SegmentedTabs value={activeTab} onValueChange={setTab}>
        <SegmentedTabList aria-label="Request part">
          <SegmentedTab value="headers">Headers</SegmentedTab>
          <SegmentedTab value="query">Query</SegmentedTab>
          {bodyAllowed && <SegmentedTab value="body">Body</SegmentedTab>}
        </SegmentedTabList>
        <SegmentedTabPanel value="headers" className="pt-3">
          <RequestPart
            field={schema.headers}
            value={node.data.headers}
            onChange={(value) => onChange('headers', value)}
            readOnly={readOnly}
          />
        </SegmentedTabPanel>
        <SegmentedTabPanel value="query" className="pt-3">
          <RequestPart
            field={schema.queryParams}
            value={node.data.queryParams}
            onChange={(value) => onChange('queryParams', value)}
            readOnly={readOnly}
          />
        </SegmentedTabPanel>
        {bodyAllowed && (
          <SegmentedTabPanel value="body" className="pt-3">
            <RequestPart
              field={schema.body}
              value={node.data.body}
              onChange={(value) => onChange('body', value)}
              readOnly={readOnly}
            />
          </SegmentedTabPanel>
        )}
      </SegmentedTabs>

      <div className="flex items-center gap-2.5">
        <Switch
          id={durableId}
          checked={durable}
          onCheckedChange={handleDurableChange}
          label="Durable"
        />
        <label htmlFor={durableId} className="min-w-0 cursor-pointer">
          <div className="text-xs text-foreground">Durable</div>
          <div className="text-[11px] text-muted-foreground/60">
            Runs inside a step: retries, a timeout, and a workflow can resume it. Off, it is a plain
            request.
          </div>
        </label>
      </div>

      {durable && (
        <div className="grid grid-cols-2 gap-2.5">
          {DURABLE_FIELDS.map((fieldId) => {
            const field = schema[fieldId]
            if (!field) return null
            const controlId = fieldTakesId(field) ? `${idBase}-${fieldId}` : undefined
            return (
              <FormField key={fieldId} label={field.label} id={controlId} hint={field.description}>
                <FieldRenderer
                  id={controlId}
                  field={field}
                  value={node.data[fieldId]}
                  onChange={(value) => onChange(fieldId, value)}
                  readOnly={readOnly}
                />
              </FormField>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** One request part's control, with the schema's hint under it. */
function RequestPart({
  field,
  value,
  onChange,
  readOnly,
}: {
  field: ConfigField | undefined
  value: unknown
  onChange: (value: unknown) => void
  readOnly?: boolean
}) {
  if (!field) return null
  return (
    <FormField label={field.label} hint={field.description}>
      <FieldRenderer field={field} value={value} onChange={onChange} readOnly={readOnly} />
    </FormField>
  )
}
