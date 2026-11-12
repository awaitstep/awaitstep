import { useState } from 'react'
import { useLibraryUsages, useLibraryVersions } from '../../data/dashboard/library'
import { failureLine } from '../../lib/action-toast'
import type { LibraryPlaceSlugs } from '../../lib/dashboard-paths'
import type { ApiLibraryVersion, LibraryKind } from '../../lib/library-api'
import { plural } from '../../lib/plural'
import { timeAgoOrDay } from '../../lib/time'
import { Button } from '../ui/button'
import { ModalDialog } from '../ui/modal-dialog'
import { LibraryKindTile } from './parts/library-kind-tile'
import { RestoreVersionConfirm } from './history/restore-version-confirm'
import { VersionCompare } from './history/version-compare'
import { VersionHistoryEmpty, type HistoryPublish } from './history/version-history-empty'

export { stillRunning } from './history/version-compare'

interface VersionHistoryDialogProps {
  place: LibraryPlaceSlugs
  item: { id: string; kind: LibraryKind; name: string }
  onClose: () => void
  /** Restoring needs an Editor where the item lives. */
  canEdit: boolean
  /** The IDE opens a version's files read-only; the page leaves it out. */
  onOpenReadOnly?: (version: string) => void
  /** After a restore lands: the IDE refreshes its tree and opens the working copy. */
  onRestored?: (version: string) => void
  /** For a never-published item (28j): when its draft was saved, and where it lives. */
  savedAt?: string
  placeName?: string
  /** The IDE publishes from the never-published state; the page leaves it out. */
  publish?: HistoryPublish
}

function publishedLine(version: ApiLibraryVersion): string {
  const by = version.publishedBy ? ` by ${version.publishedBy.name}` : ''
  return `Published${by} ${timeAgoOrDay(version.publishedAt)}`
}

/**
 * Version history (28i): the kept versions (at most three), what changed
 * from the selected one to the current, and Restore, which copies that code
 * into the working copy as the next version. Nothing is published by it.
 * An item never published gets 28j instead.
 */
export function VersionHistoryDialog({
  place,
  item,
  onClose,
  canEdit,
  onOpenReadOnly,
  onRestored,
  savedAt,
  placeName,
  publish,
}: VersionHistoryDialogProps) {
  const versions = useLibraryVersions(item.id)
  const usages = useLibraryUsages(item.id)
  const list = versions.data ?? []
  const [picked, setPicked] = useState<string | null>(null)
  const selected = list.find((v) => v.version === picked) ?? list[1] ?? list[0] ?? null
  const [confirming, setConfirming] = useState(false)

  function handleRestored(version: string) {
    setConfirming(false)
    onRestored?.(version)
    onClose()
  }

  function handleOpenReadOnly() {
    if (!selected || !onOpenReadOnly) return
    onOpenReadOnly(selected.version)
    onClose()
  }

  function handleOpenChange(open: boolean) {
    if (!open) onClose()
  }

  if (versions.data && list.length === 0) {
    return (
      <VersionHistoryEmpty
        item={item}
        savedAt={savedAt}
        placeName={placeName}
        publish={publish}
        onClose={onClose}
      />
    )
  }

  const countLine = versions.data ? plural(list.length, 'version') : undefined
  let body
  if (versions.isError) {
    body = (
      <p role="alert" className="text-xs text-status-error">
        {failureLine(versions.error, 'Couldn’t load the versions')}
      </p>
    )
  } else if (!versions.data || !selected) {
    body = <p className="text-xs text-muted-foreground">Loading versions…</p>
  } else {
    body = (
      <VersionCompare
        itemId={item.id}
        versions={list}
        selected={selected}
        usages={usages.data}
        onSelect={setPicked}
      />
    )
  }

  return (
    <>
      <ModalDialog
        open
        onOpenChange={handleOpenChange}
        size="xl"
        leading={<LibraryKindTile kind={item.kind} />}
        title={`${item.name} · version history`}
        description={countLine}
        footerStart={
          selected ? (
            <span className="text-xs text-muted-foreground">
              v{selected.version} · {publishedLine(selected)}
            </span>
          ) : undefined
        }
        actions={
          <>
            {onOpenReadOnly && selected && (
              <Button type="button" variant="outline" onClick={handleOpenReadOnly}>
                Open read-only
              </Button>
            )}
            {canEdit && selected && (
              <Button type="button" onClick={() => setConfirming(true)}>
                Restore v{selected.version}
              </Button>
            )}
          </>
        }
      >
        {body}
      </ModalDialog>
      {confirming && selected && (
        <RestoreVersionConfirm
          place={place}
          item={item}
          version={selected.version}
          onCancel={() => setConfirming(false)}
          onRestored={handleRestored}
        />
      )}
    </>
  )
}
