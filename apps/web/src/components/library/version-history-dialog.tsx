import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { useLibraryUsages, useLibraryVersions } from '../../data/dashboard/library'
import { failureLine } from '../../lib/action-toast'
import type { LibraryPlaceSlugs } from '../../lib/dashboard-paths'
import type { ApiLibraryVersion, LibraryKind } from '../../lib/library-api'
import { plural } from '../../lib/plural'
import { timeAgoOrDay } from '../../lib/time'
import { Button } from '../ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog'
import { OverlayFooter } from '../ui/overlay-parts'
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

function selectedLine(version: ApiLibraryVersion): string {
  const by = version.publishedBy ? ` by ${version.publishedBy.name}` : ''
  return `Selected v${version.version} · published${by} ${timeAgoOrDay(version.publishedAt)}`
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
  const contentRef = useRef<HTMLDivElement>(null)

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

  // Focus starts on the dialog, not on Close (28i shows no ring there), and
  // moves to the selected version once the list is in: that's what you came for.
  function focusSelectedRow(): boolean {
    const row = contentRef.current?.querySelector<HTMLElement>('[aria-pressed="true"]')
    row?.focus()
    return !!row
  }

  function handleOpenAutoFocus(event: Event) {
    event.preventDefault()
    if (!focusSelectedRow()) contentRef.current?.focus()
  }

  const listLoaded = !!versions.data && list.length > 0
  useEffect(() => {
    // A DOM focus move after the rows render; only while focus is still on the dialog itself.
    if (listLoaded && document.activeElement === contentRef.current) focusSelectedRow()
  }, [listLoaded])

  function handleRestore() {
    setConfirming(true)
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
      <p role="alert" className="px-4 py-3 text-xs text-status-error">
        {failureLine(versions.error, 'Couldn’t load the versions')}
      </p>
    )
  } else if (!versions.data || !selected) {
    body = <p className="px-4 py-3 text-xs text-muted-foreground">Loading versions…</p>
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
      <Dialog open onOpenChange={handleOpenChange}>
        <DialogContent
          ref={contentRef}
          layout="sectioned"
          size="2xl"
          className="h-[580px]"
          onOpenAutoFocus={handleOpenAutoFocus}
          {...(countLine ? {} : { 'aria-describedby': undefined })}
        >
          <div className="flex h-13 shrink-0 items-center gap-2.5 border-b border-border px-4">
            <LibraryKindTile kind={item.kind} />
            {/* The board shows the name alone; the dialog is still named for what it is. */}
            <DialogTitle className="text-sm" aria-label={`${item.name} · version history`}>
              {item.name}
            </DialogTitle>
            {countLine && <DialogDescription className="text-xs">{countLine}</DialogDescription>}
            <DialogClose asChild>
              <Button
                variant="ghost"
                size="icon"
                className="ml-auto size-7 text-muted-foreground"
                aria-label="Close"
              >
                <X aria-hidden="true" />
              </Button>
            </DialogClose>
          </div>
          <div className="flex min-h-0 flex-1 flex-col">{body}</div>
          <OverlayFooter start={selected ? selectedLine(selected) : undefined}>
            {onOpenReadOnly && selected && (
              <Button type="button" variant="outline" size="sm" onClick={handleOpenReadOnly}>
                Open read-only
              </Button>
            )}
            {canEdit && selected && (
              <Button type="button" size="sm" onClick={handleRestore}>
                Restore v{selected.version}
              </Button>
            )}
          </OverlayFooter>
        </DialogContent>
      </Dialog>
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
