import { missingRequiredFields, type NodeDefinition, type WorkflowNode } from '@awaitstep/ir'
import { nodeDraftKey, useNodeFieldDraftsStore } from '../../stores/node-field-drafts-store'
import { DynamicFields } from '../canvas/dynamic-fields'
import { InlineSwitch } from '../canvas/inline-switch'
import { Button } from '../ui/button'
import { useNodeEdit } from './node-edit-context'

interface NodeFieldsEditorProps {
  workflowId: string
  node: WorkflowNode
  definition: NodeDefinition
}

/**
 * A custom or marketplace node's fields and Inline switch in Code's node
 * details. Someone who may edit changes them here and saves them as one
 * version; everyone else sees them read-only. Edits wait as a draft until
 * Save, so typing never writes a version per keystroke.
 */
export function NodeFieldsEditor({ workflowId, node, definition }: NodeFieldsEditorProps) {
  const edit = useNodeEdit()
  const editable = edit?.canEdit === true
  const key = nodeDraftKey(workflowId, node.id)
  const base = JSON.stringify(node.data)
  const stored = useNodeFieldDraftsStore((state) => state.drafts[key])
  const busy = useNodeFieldDraftsStore((state) => state.saving[key] === true)
  const error = useNodeFieldDraftsStore((state) => state.errors[key] ?? null)
  const { setDraft, dropDraft, setSaving, setError } = useNodeFieldDraftsStore.getState()

  // A draft applies only where it can be saved (not on an older version or
  // for a viewer), and only to the data it was started from: once that was
  // saved over (the canvas, another tab), the saved values show.
  const draft = editable && stored && stored.base === base ? stored.data : null
  const values = draft ?? node.data
  const missing = missingRequiredFields(definition.configSchema, values)
  const errors = Object.fromEntries(missing.map((fieldId) => [fieldId, 'Required']))
  const hasFields = Object.keys(definition.configSchema).length > 0

  function change(fieldId: string, value: unknown) {
    const next = { ...values }
    if (value === undefined) delete next[fieldId]
    else next[fieldId] = value
    setDraft(key, { base, data: next })
  }

  function handleInlineChange(checked: boolean) {
    // Unset rather than false, as the canvas stores it.
    change('inline', checked ? true : undefined)
  }

  function handleDiscard() {
    dropDraft(key)
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!edit || !draft || busy) return
    setSaving(key, true)
    setError(key, null)
    const outcome = await edit.saveNodeFields(node.id, draft, node.data)
    setSaving(key, false)
    if (outcome.status === 'saved') dropDraft(key)
    // A conflict keeps the draft: the workspace notice says what happened.
    else if (outcome.status !== 'graph-conflict') setError(key, outcome.reason)
  }

  return (
    <form onSubmit={handleSubmit} aria-label="Node settings" className="border-t border-border/60">
      <fieldset disabled={!editable || busy} className="min-w-0 space-y-3 px-3 py-2.5">
        {hasFields && (
          <DynamicFields
            configSchema={definition.configSchema}
            data={values}
            onChange={change}
            nodeId={node.id}
            readOnly={!editable}
            errors={errors}
          />
        )}
        <InlineSwitch checked={values.inline === true} onChange={handleInlineChange} />
      </fieldset>
      {editable && (
        <div className="flex items-center gap-2 px-3 pb-2.5">
          <Button type="submit" size="sm" loading={busy} disabled={!draft || busy}>
            Save
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleDiscard}
            disabled={!draft || busy}
          >
            Discard
          </Button>
          {error !== null && (
            <p role="alert" className="min-w-0 text-2xs text-destructive">
              {error}
            </p>
          )}
        </div>
      )}
    </form>
  )
}
