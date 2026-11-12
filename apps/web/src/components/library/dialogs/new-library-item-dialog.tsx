import { useId, useState, type SubmitEvent } from 'react'
import { useCreateLibraryItem } from '../../../data/dashboard/library'
import { failureLine } from '../../../lib/action-toast'
import { libraryCodePath, type LibraryPlaceSlugs } from '../../../lib/dashboard-paths'
import type { LibraryKind } from '../../../lib/library-api'
import { useGoTo } from '../../navigation/router-shell-link'
import { Button } from '../../ui/button'
import { FormField } from '../../ui/form-field'
import { Input } from '../../ui/input'
import { ModalDialog } from '../../ui/modal-dialog'
import { LibraryKindTile } from '../parts/library-kind-tile'

const NAME_MAX = 100

const COPY: Record<LibraryKind, { title: string; description: string; placeholder: string }> = {
  module: {
    title: 'New module',
    description: 'Code your workflows and nodes import.',
    placeholder: 'e.g. Lead scoring',
  },
  node: {
    title: 'New custom node',
    description: 'A step of your own on the canvas.',
    placeholder: 'e.g. Post to Slack',
  },
}

interface NewLibraryItemDialogProps {
  place: LibraryPlaceSlugs
  kind: LibraryKind
  onClose: () => void
  /** Where the new item opens; the page goes to the IDE, the IDE stays put. */
  onCreated?: (item: { id: string }) => void
}

/** Names a new module or custom node, then opens it in the Library IDE. */
export function NewLibraryItemDialog({
  place,
  kind,
  onClose,
  onCreated,
}: NewLibraryItemDialogProps) {
  const formId = useId()
  const goTo = useGoTo()
  const create = useCreateLibraryItem(place)
  const [name, setName] = useState('')
  const trimmed = name.trim()
  const busy = create.isPending
  const copy = COPY[kind]

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault()
    if (busy || !trimmed) return
    create.mutate(
      { kind, name: trimmed },
      {
        onSuccess: (item) => {
          if (onCreated) onCreated(item)
          else goTo(libraryCodePath(place, { item: item.id }))
          onClose()
        },
      },
    )
  }

  function handleNameChange(event: React.ChangeEvent<HTMLInputElement>) {
    setName(event.target.value)
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
      leading={<LibraryKindTile kind={kind} />}
      title={copy.title}
      description={copy.description}
      actions={
        <>
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form={formId} loading={busy} disabled={!trimmed}>
            Create
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit}>
        <fieldset disabled={busy} className="m-0 flex min-w-0 flex-col gap-4 border-0 p-0">
          <FormField label="Name" required>
            <Input
              value={name}
              onChange={handleNameChange}
              placeholder={copy.placeholder}
              maxLength={NAME_MAX}
              autoFocus
            />
          </FormField>
          {create.error && (
            <p role="alert" className="text-xs text-status-error">
              {failureLine(create.error, 'Couldn’t create it')}
            </p>
          )}
        </fieldset>
      </form>
    </ModalDialog>
  )
}
