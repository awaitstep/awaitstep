import { useId, useState, type SubmitEvent } from 'react'
import { useUpdateLibraryItem } from '../../../data/dashboard/library'
import { failureLine } from '../../../lib/action-toast'
import type { LibraryPlaceSlugs } from '../../../lib/dashboard-paths'
import type { LibraryKind } from '../../../lib/library-api'
import { Button } from '../../ui/button'
import { FormField } from '../../ui/form-field'
import { Input } from '../../ui/input'
import { ModalDialog } from '../../ui/modal-dialog'
import { LibraryKindTile } from '../parts/library-kind-tile'

interface RenameLibraryItemDialogProps {
  place: LibraryPlaceSlugs
  item: { id: string; kind: LibraryKind; name: string; slug: string }
  onClose: () => void
  /** The IDE moves the item's tabs and drafts when its folder (slug) changes. */
  onRenamed?: (item: { kind: LibraryKind; slug: string }) => void
}

/**
 * Rename, and the slug a module is imported by. The API refuses a module's
 * slug change while anything uses it, naming who; that reason shows here.
 */
export function RenameLibraryItemDialog({
  place,
  item,
  onClose,
  onRenamed,
}: RenameLibraryItemDialogProps) {
  const formId = useId()
  const update = useUpdateLibraryItem(place)
  const [name, setName] = useState(item.name)
  const [slug, setSlug] = useState(item.slug)
  const busy = update.isPending
  const changes = {
    ...(name.trim() !== item.name && { name: name.trim() }),
    ...(slug.trim() !== item.slug && { slug: slug.trim() }),
  }
  const unchanged = Object.keys(changes).length === 0

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault()
    if (busy || unchanged || !name.trim() || !slug.trim()) return
    update.mutate(
      { id: item.id, ...changes },
      {
        onSuccess: (renamed) => {
          onRenamed?.(renamed)
          onClose()
        },
      },
    )
  }

  function handleNameChange(event: React.ChangeEvent<HTMLInputElement>) {
    setName(event.target.value)
    if (update.isError) update.reset()
  }

  function handleSlugChange(event: React.ChangeEvent<HTMLInputElement>) {
    setSlug(event.target.value)
    if (update.isError) update.reset()
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
      title={`Rename ${item.name}`}
      actions={
        <>
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form={formId} loading={busy} disabled={unchanged || !name.trim()}>
            Save
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit}>
        <fieldset disabled={busy} className="m-0 flex min-w-0 flex-col gap-4 border-0 p-0">
          <FormField label="Name" required>
            <Input value={name} onChange={handleNameChange} maxLength={100} autoFocus />
          </FormField>
          <FormField
            label="Slug"
            required
            hint={
              item.kind === 'module'
                ? `Imported as #modules/${slug.trim() || '…'}`
                : 'Workflows place a node by its id, so its slug can change freely.'
            }
          >
            <Input value={slug} onChange={handleSlugChange} maxLength={64} />
          </FormField>
          {update.error && (
            <p role="alert" className="text-xs text-status-error">
              {failureLine(update.error, 'Couldn’t rename it')}
            </p>
          )}
        </fieldset>
      </form>
    </ModalDialog>
  )
}
