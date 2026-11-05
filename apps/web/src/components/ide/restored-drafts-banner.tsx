import { basename } from '../../lib/ide/file-tree'
import { useIdeStore } from '../../stores/ide-store'
import { Button } from '../ui/button'
import { EditorBanner } from './editor-banner'

function names(paths: string[]): string {
  return paths.map(basename).join(', ')
}

/** After a reload brought unsaved edits back: say so, and offer to look or let go. */
export function RestoredDraftsBanner() {
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
  if (live.length === 0 && notice.deleted.length === 0) return null

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
      tone={changed.length > 0 || notice.deleted.length > 0 ? 'warn' : 'info'}
      onDismiss={handleDismiss}
      actions={
        live.length > 0 && (
          <>
            <Button size="sm" onClick={handleShow} className="h-6 px-2 text-xs">
              Show
            </Button>
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
      {live.length > 0 && <>Restored {files} from your last session.</>}
      {changed.length > 0 && (
        <>
          {' '}
          <b className="font-medium text-status-warning">{names(changed)}</b>{' '}
          {changed.length === 1 ? 'has' : 'have'} changed since you edited{' '}
          {changed.length === 1 ? 'it' : 'them'}. Saving will ask first.
        </>
      )}
      {notice.deleted.length > 0 && (
        <>
          {' '}
          <b className="font-medium text-status-warning">{names(notice.deleted)}</b>{' '}
          {notice.deleted.length === 1 ? 'was' : 'were'} deleted since you edited{' '}
          {notice.deleted.length === 1 ? 'it' : 'them'}, so the edits weren’t restored.
        </>
      )}
    </EditorBanner>
  )
}
