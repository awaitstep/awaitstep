import { useRestoreLibraryVersion } from '../../data/dashboard/library'
import { failureLine } from '../../lib/action-toast'
import type { ApiLibraryTreeItem, LibraryPlace } from '../../lib/library-api'
import { ConfirmDialog } from '../ui/confirm-dialog'

interface RestoreConfirmDialogProps {
  place: LibraryPlace
  item: ApiLibraryTreeItem
  version: string
  onClose: () => void
  onRestored: (itemId: string) => void
}

/**
 * Restore and New version both replace the working copy (a node's open
 * folder), so they ask first and say what goes (D9). New version is a
 * restore of the latest.
 */
export function RestoreConfirmDialog({
  place,
  item,
  version,
  onClose,
  onRestored,
}: RestoreConfirmDialogProps) {
  const restore = useRestoreLibraryVersion(place)
  // A node's New version is a restore of its latest.
  const newVersion = item.kind === 'node' && version === item.latestVersion
  const title = newVersion ? `Start a new version of ${item.name}?` : `Restore v${version}?`

  function handleConfirm() {
    restore.mutate(
      { id: item.id, version },
      {
        onSuccess: () => {
          onRestored(item.id)
          onClose()
        },
      },
    )
  }

  function handleOpenChange(open: boolean) {
    if (!open && !restore.isPending) onClose()
  }

  let description: React.ReactNode =
    item.kind === 'module'
      ? `v${version}'s code replaces your working copy as the next version. Unsaved and unpublished changes there are lost.`
      : `A new folder starts from v${version} as the next version, replacing any unpublished one.`
  if (restore.error) {
    description = (
      <span role="alert" className="text-status-error">
        {failureLine(restore.error, 'Couldn’t do that')}
      </span>
    )
  }

  return (
    <ConfirmDialog
      open
      onOpenChange={handleOpenChange}
      title={title}
      description={description}
      confirmLabel={newVersion ? 'New version' : 'Restore'}
      variant="warning"
      loading={restore.isPending}
      onConfirm={handleConfirm}
    />
  )
}
