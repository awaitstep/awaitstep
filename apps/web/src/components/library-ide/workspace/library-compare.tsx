import { useIdeStore } from '../../../stores/ide-store'
import type { LibraryWorkspace } from '../../../hooks/use-library-workspace'
import { CompareDialog } from '../compare-dialog'

/** A refused save's Compare: the server's copy beside mine, and which one to keep. */
export function LibraryCompare({
  ws,
  path,
  onClose,
}: {
  ws: LibraryWorkspace
  path: string
  onClose: () => void
}) {
  const clearDraft = useIdeStore((s) => s.clearDraft)
  const file = ws.index.files.get(path) ?? null
  if (!file) return null

  function handleUseServer() {
    clearDraft(path)
  }

  function handleKeepMine(serverHash: string | null) {
    void ws.actions.overwriteFile(path, serverHash)
  }

  return (
    <CompareDialog
      path={path}
      file={file}
      mine={ws.files.get(path)?.source ?? ''}
      onUseServer={handleUseServer}
      onKeepMine={handleKeepMine}
      onClose={onClose}
    />
  )
}
