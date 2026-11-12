import { useState } from 'react'
import {
  useLibraryUsages,
  useLibraryVersion,
  useLibraryVersions,
  useRestoreLibraryVersion,
} from '../../data/dashboard/library'
import { failureLine } from '../../lib/action-toast'
import type { LibraryPlaceSlugs } from '../../lib/dashboard-paths'
import type { ApiLibraryUsages, ApiLibraryVersion, LibraryKind } from '../../lib/library-api'
import { diffTotals, diffVersions } from '../../lib/library/version-diff'
import { timeAgoOrDay } from '../../lib/time'
import { Button } from '../ui/button'
import { ConfirmDialog } from '../ui/confirm-dialog'
import { ModalDialog } from '../ui/modal-dialog'
import { LibraryKindTile } from './parts/library-kind-tile'
import { VersionDiffList } from './parts/version-diff-list'
import { VersionList } from './parts/version-list'

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
}

/** How many workflows' live deployments still run `version`. */
export function stillRunning(usages: ApiLibraryUsages | undefined, version: string): number {
  if (!usages) return 0
  return usages.usedBy.visible.filter((c) => c.kind === 'workflow' && c.runs === version).length
}

function stillRunningLine(count: number, version: string): string | null {
  if (count === 0) return null
  return count === 1
    ? `1 workflow still runs v${version}`
    : `${count} workflows still run v${version}`
}

function publishedLine(version: ApiLibraryVersion): string {
  const by = version.publishedBy ? ` by ${version.publishedBy.name}` : ''
  return `Published${by} ${timeAgoOrDay(version.publishedAt)}`
}

/**
 * Version history (28i): the kept versions (at most three), what changed
 * from the selected one to the current, and Restore, which copies that code
 * into the working copy as the next version. Nothing is published by it.
 */
export function VersionHistoryDialog({
  place,
  item,
  onClose,
  canEdit,
  onOpenReadOnly,
  onRestored,
}: VersionHistoryDialogProps) {
  const versions = useLibraryVersions(item.id)
  const usages = useLibraryUsages(item.id)
  const restore = useRestoreLibraryVersion(place)
  const list = versions.data ?? []
  const current = list[0] ?? null
  const [picked, setPicked] = useState<string | null>(null)
  const selected = list.find((v) => v.version === picked) ?? list[1] ?? current
  const [confirming, setConfirming] = useState(false)

  const currentDetail = useLibraryVersion(item.id, current?.version ?? null)
  const selectedDetail = useLibraryVersion(item.id, selected?.version ?? null)
  const comparing = selected !== null && current !== null && selected.version !== current.version
  const diffs =
    comparing && currentDetail.data && selectedDetail.data
      ? diffVersions(selectedDetail.data.files, currentDetail.data.files)
      : []
  const totals = diffTotals(diffs)

  function handleRestoreRequest() {
    setConfirming(true)
  }

  function handleConfirmChange(open: boolean) {
    if (!open && !restore.isPending) setConfirming(false)
  }

  function handleRestore() {
    if (!selected) return
    restore.mutate(
      { id: item.id, version: selected.version },
      {
        onSuccess: (result) => {
          setConfirming(false)
          onRestored?.(result.version)
          onClose()
        },
      },
    )
  }

  function handleOpenReadOnly() {
    if (!selected || !onOpenReadOnly) return
    onOpenReadOnly(selected.version)
    onClose()
  }

  function handleOpenChange(open: boolean) {
    if (!open) onClose()
  }

  const countLine = list.length === 1 ? '1 version' : `${list.length} versions`
  let body
  if (versions.isError) {
    body = (
      <p role="alert" className="text-xs text-status-error">
        {failureLine(versions.error, 'Couldn’t load the versions')}
      </p>
    )
  } else if (!versions.data) {
    body = <p className="text-xs text-muted-foreground">Loading versions…</p>
  } else if (list.length === 0) {
    body = <p className="text-xs text-muted-foreground">Nothing published yet.</p>
  } else {
    const running = selected
      ? stillRunningLine(stillRunning(usages.data, selected.version), selected.version)
      : null
    body = (
      <div className="grid min-h-0 gap-4 md:grid-cols-[200px_1fr]">
        <VersionList
          versions={list}
          selected={selected?.version ?? null}
          inUse={(v) => stillRunning(usages.data, v) > 0}
          onSelect={setPicked}
        />
        <div className="flex min-w-0 flex-col gap-3">
          {comparing ? (
            <>
              <p className="text-xs text-muted-foreground">
                v{selected.version} → v{current.version} (current){' '}
                <span className="text-status-success">+{totals.added}</span>{' '}
                <span className="text-status-error">−{totals.removed}</span>
              </p>
              <VersionDiffList
                diffs={diffs}
                loading={!currentDetail.data || !selectedDetail.data}
              />
            </>
          ) : (
            <p className="text-xs text-muted-foreground">
              This is the current version. Pick an older one to see what changed since.
            </p>
          )}
          {running && <p className="text-xs text-muted-foreground">{running}</p>}
        </div>
      </div>
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
        description={versions.data ? countLine : undefined}
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
              <Button type="button" onClick={handleRestoreRequest}>
                Restore v{selected.version}
              </Button>
            )}
          </>
        }
      >
        {body}
      </ModalDialog>
      {confirming && selected && (
        <ConfirmDialog
          open
          onOpenChange={handleConfirmChange}
          title={`Restore v${selected.version}?`}
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
      )}
    </>
  )
}
