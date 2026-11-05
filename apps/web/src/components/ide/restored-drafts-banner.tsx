import { basename } from '../../lib/ide/file-tree'
import { useIdeStore } from '../../stores/ide-store'
import { Button } from '../ui/button'
import { EditorBanner } from './editor-banner'

function names(paths: string[]): string {
  return paths.map(basename).join(', ')
}

interface RestoredDraftsBannerProps {
  /** Opens Compare for a restored file the server has changed since. */
  onCompare: (path: string) => void
}

/** After a reload brought unsaved edits back: say so, and offer to look or let go. */
export function RestoredDraftsBanner({ onCompare }: RestoredDraftsBannerProps) {
  const notice = useIdeStore((s) => s.restoreNotice)
  const drafts = useIdeStore((s) => s.drafts)
  const openFile = useIdeStore((s) => s.openFile)
  const clearDraft = useIdeStore((s) => s.clearDraft)
  const setRestoreNotice = useIdeStore((s) => s.setRestoreNotice)

  if (!notice) return null
  // What was restored may since have been saved, discarded or reverted; the
  // banner only speaks about what is still unsaved.
  const live = notice.paths.filter((path) => path in drafts)
  const changed = notice.changedOnServer.filter((path) => live.includes(path))
  const deleted = notice.deleted.filter((path) => live.includes(path))
  if (live.length === 0) return null

  function handleShow() {
    if (live[0]) openFile(live[0])
  }

  function handleDiscard() {
    for (const path of live) clearDraft(path)
    setRestoreNotice(null)
  }

  function handleDismiss() {
    setRestoreNotice(null)
  }

  const files = live.length === 1 ? '1 unsaved file' : `${live.length} unsaved files`

  return (
    <EditorBanner
      tone={changed.length > 0 || deleted.length > 0 ? 'warn' : 'info'}
      onDismiss={handleDismiss}
      actions={
        live.length > 0 && (
          <>
            <Button size="sm" onClick={handleShow} className="h-6 px-2 text-xs">
              Show
            </Button>
            {changed.map((path) => (
              <CompareButton key={path} path={path} onCompare={onCompare} />
            ))}
            <Button
              size="sm"
              variant="outline"
              onClick={handleDiscard}
              className="h-6 px-2 text-xs"
            >
              Discard
            </Button>
          </>
        )
      }
    >
      Restored {files} from your last session.
      {changed.length > 0 && (
        <>
          {' '}
          <b className="font-medium text-status-warning">{names(changed)}</b>{' '}
          {changed.length === 1 ? 'has' : 'have'} changed on the server since you edited{' '}
          {changed.length === 1 ? 'it' : 'them'}.
        </>
      )}
      {deleted.length > 0 && (
        <>
          {' '}
          <b className="font-medium text-status-warning">{names(deleted)}</b>{' '}
          {deleted.length === 1 ? 'was' : 'were'} deleted on the server since you edited{' '}
          {deleted.length === 1 ? 'it' : 'them'}. Your copy is kept.
        </>
      )}
    </EditorBanner>
  )
}

function CompareButton({ path, onCompare }: { path: string; onCompare: (path: string) => void }) {
  function handleClick() {
    onCompare(path)
  }
  return (
    <Button size="sm" variant="outline" onClick={handleClick} className="h-6 px-2 text-xs">
      Compare {basename(path)}
    </Button>
  )
}
