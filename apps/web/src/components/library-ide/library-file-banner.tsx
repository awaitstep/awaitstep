import { useIdeStore } from '../../stores/ide-store'
import { Button } from '../ui/button'
import { EditorBanner } from '../ide/editor-banner'
import { ctxFileNote, readOnlyNote } from './library-file-notes'

interface LibraryFileBannerProps {
  path: string
  readOnly: boolean
  readOnlyReason: string | null
  onRevert: (path: string) => void
  onOverwrite: (path: string, serverHash: string | null) => void
  onCompare: (path: string) => void
}

/**
 * One line above the editor: why a file can't change (a published folder,
 * the project's module, the generated ctx.d.ts, a viewer), or that a save
 * was refused because the file changed on the server.
 */
export function LibraryFileBanner({
  path,
  readOnly,
  readOnlyReason,
  onRevert,
  onOverwrite,
  onCompare,
}: LibraryFileBannerProps) {
  const conflict = useIdeStore((s) => s.conflicts[path])

  function handleUseServer() {
    onRevert(path)
  }

  function handleCompare() {
    onCompare(path)
  }

  function handleOverwrite() {
    onOverwrite(path, conflict?.currentHash ?? null)
  }

  if (conflict) {
    return (
      <EditorBanner
        tone="warn"
        actions={
          <>
            <Button type="button" size="sm" variant="outline" onClick={handleCompare}>
              Compare
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={handleUseServer}>
              Use the server’s
            </Button>
            <Button type="button" size="sm" onClick={handleOverwrite}>
              Keep mine
            </Button>
          </>
        }
      >
        It changed on the server since you opened it.
      </EditorBanner>
    )
  }
  if (!readOnly) return null
  const note = ctxFileNote(path) ?? readOnlyNote(path, readOnlyReason)
  return <EditorBanner tone="info">{note}</EditorBanner>
}
