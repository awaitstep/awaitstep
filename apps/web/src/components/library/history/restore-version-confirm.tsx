import { useRestoreLibraryVersion } from '../../../data/dashboard/library'
import { failureLine } from '../../../lib/action-toast'
import type { LibraryPlaceSlugs } from '../../../lib/dashboard-paths'
import type { LibraryKind } from '../../../lib/library-api'
import { ConfirmDialog } from '../../ui/confirm-dialog'

interface RestoreVersionConfirmProps {
  place: LibraryPlaceSlugs
  item: { id: string; kind: LibraryKind }
  version: string
  onCancel: () => void
  /** The restore landed: `version` is the working copy's new version. */
  onRestored: (version: string) => void
}

/** Restore asks first: it replaces the working copy, and unpublished edits there go. */
export function RestoreVersionConfirm({
  place,
  item,
  version,
  onCancel,
  onRestored,
}: RestoreVersionConfirmProps) {
  const restore = useRestoreLibraryVersion(place)

  function handleOpenChange(open: boolean) {
    if (!open && !restore.isPending) onCancel()
  }

  function handleRestore() {
    restore.mutate({ id: item.id, version }, { onSuccess: (result) => onRestored(result.version) })
  }

  return (
    <ConfirmDialog
      open
      onOpenChange={handleOpenChange}
      title={`Restore v${version}?`}
      description={
        restore.error ? (
          <span role="alert" className="text-status-error">
            {failureLine(restore.error, 'Couldn’t restore it')}
          </span>
        ) : item.kind === 'module' ? (
          'Its code replaces your working copy as the next version. Unpublished changes there are lost.'
        ) : (
          'Its code becomes the next version’s folder, replacing any unpublished one.'
        )
      }
      confirmLabel="Restore"
      variant="warning"
      loading={restore.isPending}
      onConfirm={handleRestore}
    />
  )
}
