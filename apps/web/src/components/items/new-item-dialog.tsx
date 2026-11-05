import { useId, useState, type SubmitEvent } from 'react'
import { Code, Workflow } from 'lucide-react'
import { useCreateItem } from '../../data/dashboard/items'
import { failureLine } from '../../lib/action-toast'
import { newItemPath, type WorkspaceSlugs } from '../../lib/dashboard-paths'
import type { ItemKind } from '../../types/dashboard/items'
import { useGoTo } from '../navigation/router-shell-link'
import { Button } from '../ui/button'
import { RadioCardGroup, type RadioCardOption } from '../ui/choice-card'
import { FormField } from '../ui/form-field'
import { Input } from '../ui/input'
import { ModalDialog } from '../ui/modal-dialog'
import { Textarea } from '../ui/textarea'
import { Tile } from '../ui/tile'
import { ITEM_KIND_LABEL } from './item-kind'

/** How a new workflow starts: on the template picker, or an empty canvas. */
export type ItemStart = 'template' | 'blank'

export interface NewItemRequest {
  kind: ItemKind
  start: ItemStart
}

const NAME_MAX = 255
const DESCRIPTION_MAX = 1000

const START_OPTIONS: RadioCardOption<ItemStart>[] = [
  { value: 'template', title: 'From a template', description: 'Pick one to start from.' },
  { value: 'blank', title: 'Blank', description: 'An empty canvas.' },
]

const COPY: Record<ItemKind, { description: string; placeholder: string }> = {
  workflow: {
    description: 'Durable steps that retry, wait and resume.',
    placeholder: 'e.g. Lead enrichment',
  },
  script: {
    description: 'A request handler without steps.',
    placeholder: 'e.g. CRM sync',
  },
}

interface NewItemDialogProps {
  slugs: WorkspaceSlugs
  request: NewItemRequest
  onClose: () => void
}

/**
 * New workflow / New function: its name and description, and for a workflow
 * how it starts. Nothing is created until Create, which opens its editor.
 */
export function NewItemDialog({ slugs, request, onClose }: NewItemDialogProps) {
  const formId = useId()
  const goTo = useGoTo()
  const { kind } = request
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [start, setStart] = useState<ItemStart>(request.start)
  // Opened from the hook's own success, not mutate's: from an empty state,
  // the button is gone by the time the lists have refetched.
  const create = useCreateItem(slugs, {
    onCreated: (item) => goTo(newItemPath(slugs, item, { blank: start === 'blank' })),
  })
  // From the click until the editor opens: a second click would make a second item.
  const busy = create.isPending || create.isSuccess
  const label = ITEM_KIND_LABEL[kind]
  const trimmed = name.trim()

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault()
    if (busy || !trimmed) return
    create.mutate({ kind, name: trimmed, description: description.trim() || undefined })
  }

  function handleNameChange(next: string) {
    setName(next)
    // Only a failure is cleared: resetting a create on its way would let it run twice.
    if (create.isError) create.reset()
  }

  function handleOpenChange(open: boolean) {
    if (!open && !busy) onClose()
  }

  return (
    <ModalDialog
      open
      onOpenChange={handleOpenChange}
      size="md"
      leading={
        <Tile tone={kind === 'script' ? 'info' : 'ok'} size="lg">
          {kind === 'script' ? <Code /> : <Workflow />}
        </Tile>
      }
      title={`New ${label.toLowerCase()}`}
      description={COPY[kind].description}
      actions={
        <>
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form={formId} loading={busy} disabled={!trimmed}>
            Create {label.toLowerCase()}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit}>
        {/* Nothing changes once Create is on its way: not the name, not how it starts. */}
        <fieldset disabled={busy} className="m-0 flex min-w-0 flex-col gap-4.5 border-0 p-0">
          <FormField label="Name" required>
            <Input
              value={name}
              onChange={(event) => handleNameChange(event.target.value)}
              placeholder={COPY[kind].placeholder}
              maxLength={NAME_MAX}
              autoFocus
            />
          </FormField>
          <FormField label="Description" optional>
            <Textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What does it do?"
              maxLength={DESCRIPTION_MAX}
            />
          </FormField>
          {/* Templates are workflow-shaped: a function always starts on its canvas. */}
          {kind === 'workflow' && (
            <RadioCardGroup
              legend="Start from"
              value={start}
              onChange={setStart}
              options={START_OPTIONS}
              layout="grid"
            />
          )}
          {create.error && (
            <p role="alert" className="text-xs text-status-error">
              {failureLine(create.error, `Couldn’t create the ${label.toLowerCase()}`)}
            </p>
          )}
        </fieldset>
      </form>
    </ModalDialog>
  )
}
