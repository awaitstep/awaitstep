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
  /** The project's name when the copy goes to its library instead of beside the item. */
  toProject?: string
  /** The page opens the copy in the IDE; the IDE selects it in place. */
  onDuplicated?: (item: { id: string }) => void
}

/**
 * A copy beside the item, or in the project's library, unpublished at 1.0.0,
 * then opened in the IDE where it lives.
 */
export function DuplicateLibraryItemDialog({
  place,
  item,
  onClose,
  toProject,
  onDuplicated,
}: DuplicateLibraryItemDialogProps) {
  const formId = useId()
  const goTo = useGoTo()
  const duplicate = useDuplicateLibraryItem(place)
  // In the project the name is free to stay; beside the item it can't.
  const [name, setName] = useState(toProject ? item.name : `${item.name} copy`)
  const trimmed = name.trim()
  const busy = duplicate.isPending

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault()
    if (busy || !trimmed) return
    duplicate.mutate(
      { id: item.id, name: trimmed, ...(toProject && { to: 'project' as const }) },
      {
        onSuccess: (copy) => {
          const home = toProject ? { org: place.org, project: place.project } : place
          if (onDuplicated) onDuplicated(copy)
          else goTo(libraryCodePath(home, { item: copy.id }))
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
      title={toProject ? `Copy ${item.name} to ${toProject}` : `Duplicate ${item.name}`}
      description={
        toProject
          ? 'Every workspace can use the copy. It starts at 1.0.0 and isn’t published.'
          : 'The copy starts at 1.0.0 and isn’t published.'
      }
      actions={
        <>
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form={formId} loading={busy} disabled={!trimmed}>
            {toProject ? 'Copy' : 'Duplicate'}
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
              {failureLine(
                duplicate.error,
                toProject ? 'Couldn’t copy it' : 'Couldn’t duplicate it',
              )}
            </p>
          )}
        </fieldset>
      </form>
    </ModalDialog>
  )
}
