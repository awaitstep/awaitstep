import { useId, useState, type SubmitEvent } from 'react'
import { useDuplicateLibraryItem } from '../../../data/dashboard/library'
import { failureLine } from '../../../lib/action-toast'
import { libraryCodePath, type LibraryPlaceSlugs } from '../../../lib/dashboard-paths'
import type { LibraryKind } from '../../../lib/library-api'
import { useGoTo } from '../../navigation/router-shell-link'
import { Button } from '../../ui/button'
import { FormField } from '../../ui/form-field'
import { Input } from '../../ui/input'
import { ModalDialog } from '../../ui/modal-dialog'
import { LibraryKindTile } from '../parts/library-kind-tile'

interface DuplicateLibraryItemDialogProps {
  place: LibraryPlaceSlugs
  item: { id: string; kind: LibraryKind; name: string }
  onClose: () => void
  /** The page opens the copy in the IDE; the IDE selects it in place. */
  onDuplicated?: (item: { id: string }) => void
}

/** A copy beside the item, unpublished at 1.0.0, then opened in the IDE. */
export function DuplicateLibraryItemDialog({
  place,
  item,
  onClose,
  onDuplicated,
}: DuplicateLibraryItemDialogProps) {
  const formId = useId()
  const goTo = useGoTo()
  const duplicate = useDuplicateLibraryItem(place)
  const [name, setName] = useState(`${item.name} copy`)
  const trimmed = name.trim()
  const busy = duplicate.isPending

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault()
    if (busy || !trimmed) return
    duplicate.mutate(
      { id: item.id, name: trimmed },
      {
        onSuccess: (copy) => {
          if (onDuplicated) onDuplicated(copy)
          else goTo(libraryCodePath(place, { item: copy.id }))
          onClose()
        },
      },
    )
  }

  function handleNameChange(event: React.ChangeEvent<HTMLInputElement>) {
    setName(event.target.value)
    if (duplicate.isError) duplicate.reset()
  }

  function handleOpenChange(open: boolean) {
    if (!open && !busy) onClose()
  }

  return (
    <ModalDialog
      open
      onOpenChange={handleOpenChange}
      size="md"
      leading={<LibraryKindTile kind={item.kind} />}
      title={`Duplicate ${item.name}`}
      description="The copy starts at 1.0.0 and isn’t published."
      actions={
        <>
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form={formId} loading={busy} disabled={!trimmed}>
            Duplicate
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit}>
        <fieldset disabled={busy} className="m-0 flex min-w-0 flex-col gap-4 border-0 p-0">
          <FormField label="Name" required>
            <Input value={name} onChange={handleNameChange} maxLength={100} autoFocus />
          </FormField>
          {duplicate.error && (
            <p role="alert" className="text-xs text-status-error">
              {failureLine(duplicate.error, 'Couldn’t duplicate it')}
            </p>
          )}
        </fieldset>
      </form>
    </ModalDialog>
  )
}
