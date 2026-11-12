import { useDeleteLibraryItem } from '../../../data/dashboard/library'
import { failureLine } from '../../../lib/action-toast'
import type { LibraryPlaceSlugs } from '../../../lib/dashboard-paths'
import { ConfirmDialog } from '../../ui/confirm-dialog'

interface DeleteLibraryItemDialogProps {
  place: LibraryPlaceSlugs
  item: { id: string; name: string }
  onClose: () => void
  onDeleted?: () => void
}

/**
 * Asks first. The API refuses while anything uses the item and names who
 * ("Can’t delete: used by …"); that reason replaces the question.
 */
export function DeleteLibraryItemDialog({
  place,
  item,
  onClose,
  onDeleted,
}: DeleteLibraryItemDialogProps) {
  const remove = useDeleteLibraryItem(place)

  function handleConfirm() {
    remove.mutate(item.id, {
      onSuccess: () => {
        onDeleted?.()
        onClose()
      },
    })
  }

  function handleOpenChange(open: boolean) {
    if (!open && !remove.isPending) onClose()
  }

  const description = remove.error ? (
    <span role="alert" className="text-status-error">
      {failureLine(remove.error, 'Couldn’t delete it')}
    </span>
  ) : (
    'Its code and every published version go. This can’t be undone.'
  )

  return (
    <ConfirmDialog
      open
      onOpenChange={handleOpenChange}
      title={`Delete ${item.name}?`}
      description={description}
      confirmLabel="Delete"
      variant="destructive"
      loading={remove.isPending}
      onConfirm={handleConfirm}
    />
  )
}
