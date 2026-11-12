import { useLibraryUsages, usePublishLibraryItem } from '../../data/dashboard/library'
import { failureLine } from '../../lib/action-toast'
import type { ApiLibraryTreeItem, LibraryPlace } from '../../lib/library-api'
import { ConfirmDialog } from '../ui/confirm-dialog'
import { consumerNames } from '../library/library-format'

interface PublishDialogProps {
  place: LibraryPlace
  item: ApiLibraryTreeItem
  version: string
  bumpedFrom: string | null
  onClose: () => void
  /** A refusal: the check's problems are worth showing again. */
  onRefused: () => void
}

/**
 * Publish asks first and names who will pick the version up: every
 * consumer's next deploy uses the latest published version (no pins).
 */
export function PublishDialog({
  place,
  item,
  version,
  bumpedFrom,
  onClose,
  onRefused,
}: PublishDialogProps) {
  const usages = useLibraryUsages(item.id)
  const publish = usePublishLibraryItem(place)
  const names = usages.data ? consumerNames(usages.data.usedBy) : null

  function handleConfirm() {
    publish.mutate(item.id, {
      onSuccess: onClose,
      onError: onRefused,
    })
  }

  function handleOpenChange(open: boolean) {
    if (!open && !publish.isPending) onClose()
  }

  let consumers: React.ReactNode
  if (!names) consumers = 'Checking who uses it…'
  else if (names.length === 0) consumers = 'Nothing uses it yet.'
  else {
    consumers = (
      <>
        Used by {names.join(', ')}. Each picks up v{version} on its next deploy.
      </>
    )
  }

  return (
    <ConfirmDialog
      open
      onOpenChange={handleOpenChange}
      title={`Publish ${item.name} v${version}?`}
      description={
        <span className="flex flex-col gap-2">
          {bumpedFrom && (
            <span>
              v{bumpedFrom} is already published, so this publishes v{version} and updates
              package.json.
            </span>
          )}
          <span>{consumers}</span>
          {publish.error && (
            <span role="alert" className="text-status-error">
              {failureLine(publish.error, 'Couldn’t publish it')}
            </span>
          )}
        </span>
      }
      confirmLabel={`Publish v${version}`}
      loading={publish.isPending}
      onConfirm={handleConfirm}
    />
  )
}
