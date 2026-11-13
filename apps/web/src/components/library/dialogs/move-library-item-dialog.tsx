import { useMoveLibraryItemToProject } from '../../../data/dashboard/library'
import { failureLine } from '../../../lib/action-toast'
import type { LibraryPlaceSlugs } from '../../../lib/dashboard-paths'
import { ConfirmDialog } from '../../ui/confirm-dialog'

interface MoveLibraryItemDialogProps {
  place: LibraryPlaceSlugs
  item: { id: string; name: string }
  projectName: string
  onClose: () => void
}

/**
 * Asks first: the item leaves the workspace for the project's library. The
 * API's refusal (a slug the project has, a module only the workspace has)
 * replaces the question.
 */
export function MoveLibraryItemDialog({
  place,
  item,
  projectName,
  onClose,
}: MoveLibraryItemDialogProps) {
  const move = useMoveLibraryItemToProject(place)

  function handleConfirm() {
    move.mutate(item.id, { onSuccess: onClose })
  }

  function handleOpenChange(open: boolean) {
    if (!open && !move.isPending) onClose()
  }

  const description = move.error ? (
    <span role="alert" className="text-status-error">
      {failureLine(move.error, 'Couldn’t move it')}
    </span>
  ) : (
    `Every workspace in ${projectName} can use it, and only project members can change it. Workflows that use it keep working.`
  )

  return (
    <ConfirmDialog
      open
      onOpenChange={handleOpenChange}
      title={`Move ${item.name} to ${projectName}?`}
      description={description}
      confirmLabel="Move"
      variant="warning"
      loading={move.isPending}
      onConfirm={handleConfirm}
    />
  )
}
