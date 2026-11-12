import { useBlocker } from '@tanstack/react-router'
import { useShallow } from 'zustand/react/shallow'
import type { LibraryWorkspace } from '../../../hooks/use-library-workspace'
import { useIdeStore } from '../../../stores/ide-store'
import { CloseDirtyDialog } from '../../ide/close-dirty-dialog'
import { WorkspaceUnsavedDialog } from '../../ide/workspace-dialogs'

/**
 * What stops edits being lost: closing a tab with unsaved changes asks
 * first, and so does leaving the page (the router and the browser alike).
 */
export function LibraryGuards({ ws }: { ws: LibraryWorkspace }) {
  const { actions, dirty } = ws
  const { openFile, clearDraft, closeFiles } = useIdeStore(
    useShallow((s) => ({
      openFile: s.openFile,
      clearDraft: s.clearDraft,
      closeFiles: s.closeFiles,
    })),
  )
  const hasUnsaved = dirty.size > 0
  const blocker = useBlocker({
    shouldBlockFn: () => hasUnsaved,
    enableBeforeUnload: () => hasUnsaved,
    withResolver: true,
  })

  function handleCloseSave(dirtyPaths: string[], paths: string[]) {
    void actions.saveFiles(dirtyPaths).then((results) => {
      if (results.every(Boolean)) closeFiles(paths)
    })
  }

  function handleCloseDiscard(dirtyPaths: string[], paths: string[]) {
    for (const path of dirtyPaths) clearDraft(path)
    closeFiles(paths)
  }

  return (
    <>
      <CloseDirtyDialog
        saving={actions.busy}
        onSave={handleCloseSave}
        onDiscard={handleCloseDiscard}
        onReview={openFile}
      />
      {/* Review… needs the workflow IDE's Unsaved changes tab, so it is not offered here. */}
      <WorkspaceUnsavedDialog
        blocker={blocker}
        dirtyCount={dirty.size}
        canEdit={ws.canEdit}
        wideEnough={false}
        saving={actions.busy}
        saveAll={actions.saveAll}
      />
    </>
  )
}
