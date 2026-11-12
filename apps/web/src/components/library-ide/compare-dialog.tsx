import { useQuery } from '@tanstack/react-query'
import { libraryItemKeys } from '../../data/dashboard/library'
import { failureLine } from '../../lib/action-toast'
import { basename } from '../../lib/ide/file-tree'
import { libraryApi } from '../../lib/library-api'
import { diffTotals, diffVersions } from '../../lib/library/version-diff'
import { Button } from '../ui/button'
import { ModalDialog } from '../ui/modal-dialog'
import { VersionDiffList } from '../library/parts/version-diff-list'

interface CompareDialogProps {
  path: string
  file: { itemId: string; itemPath: string }
  /** The text in the editor. */
  mine: string
  onUseServer: () => void
  onKeepMine: (serverHash: string | null) => void
  onClose: () => void
}

/**
 * A refused save, side by side: what the server holds now against the
 * editor's text. Keep mine overwrites exactly the copy shown here; anything
 * newer is a fresh conflict.
 */
export function CompareDialog({
  path,
  file,
  mine,
  onUseServer,
  onKeepMine,
  onClose,
}: CompareDialogProps) {
  const server = useQuery({
    queryKey: [...libraryItemKeys.file(file.itemId, file.itemPath), 'compare'],
    queryFn: () => libraryApi.getFile(file.itemId, file.itemPath),
    staleTime: 0,
  })
  const diffs = server.data
    ? diffVersions([{ path, source: server.data.source }], [{ path, source: mine }])
    : []
  const totals = diffTotals(diffs)

  function handleOpenChange(open: boolean) {
    if (!open) onClose()
  }

  function handleUseServer() {
    onUseServer()
    onClose()
  }

  function handleKeepMine() {
    onKeepMine(server.data?.hash ?? null)
    onClose()
  }

  let body
  if (server.isError) {
    body = (
      <p role="alert" className="text-xs text-status-error">
        {failureLine(server.error, 'Couldn’t load the server’s copy')}
      </p>
    )
  } else {
    body = (
      <div className="flex flex-col gap-2">
        <p className="text-xs text-muted-foreground">
          The server’s copy → yours <span className="text-status-success">+{totals.added}</span>{' '}
          <span className="text-status-error">−{totals.removed}</span>
        </p>
        <VersionDiffList diffs={diffs} loading={!server.data} />
      </div>
    )
  }

  return (
    <ModalDialog
      open
      onOpenChange={handleOpenChange}
      size="xl"
      title={`Compare ${basename(path)}`}
      description="It changed on the server since you opened it."
      actions={
        <>
          <Button type="button" variant="outline" onClick={handleUseServer}>
            Use the server’s
          </Button>
          <Button type="button" onClick={handleKeepMine} disabled={!server.data}>
            Keep mine
          </Button>
        </>
      }
    >
      {body}
    </ModalDialog>
  )
}
