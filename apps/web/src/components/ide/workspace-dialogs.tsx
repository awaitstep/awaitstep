import { actionToast, LONG_TOAST_MS } from '../../lib/action-toast'
import {
  describeHandlerDeclarations,
  type HandlerConversionPreview,
  type SourceFile,
} from '../../lib/api-client'
import { basename } from '../../lib/ide/file-tree'
import { surfaceSwitchTarget } from '../../lib/workflows/surfaces'
import type { ProjectFilesController } from '../../hooks/use-project-files'
import { useIdeExplorerStore } from '../../stores/ide-explorer-store'
import { useIdeLayoutStore } from '../../stores/ide-layout-store'
import { useIdeStore } from '../../stores/ide-store'
import { ConfirmDialog } from '../ui/confirm-dialog'
import { UnsavedChangesDialog } from '../workflows/unsaved-changes-dialog'
import { CloseDirtyDialog } from './close-dirty-dialog'
import { FilePathDialog } from './file-path-dialog'
import { describeConversion } from './workspace-notices'

interface WorkspaceDialogsProps {
  baseline: ReadonlyMap<string, SourceFile>
  projectFiles: ProjectFilesController
  /**
   * What the conversion will do. The query lives in the always-mounted
   * workspace, not here: this unmounts in a narrow window, and its observer
   * going with it would let the cache drop the plan under an open dialog.
   */
  conversionPreview: {
    data: HandlerConversionPreview | undefined
    error: Error | null
    isPending: boolean
  }
}

/**
 * The dialogs that act on project files: rename, delete, convert to handler
 * modules, and the Save / Don't save question for closing unsaved tabs.
 * Which one is open lives in the session store, so this reads it directly.
 */
export function WorkspaceDialogs({
  baseline,
  projectFiles,
  conversionPreview,
}: WorkspaceDialogsProps) {
  const dialog = useIdeStore((s) => s.dialog)
  const dialogTarget = useIdeStore((s) => s.dialogTarget)
  const closeDialog = useIdeStore((s) => s.closeDialog)
  const closeFiles = useIdeStore((s) => s.closeFiles)
  const clearDraft = useIdeStore((s) => s.clearDraft)
  const renameExisting = [...baseline.keys()].filter((p) => p !== dialogTarget)

  function handleDialogOpenChange(open: boolean) {
    if (!open) closeDialog()
  }

  function handleConvert() {
    closeDialog()
    void projectFiles.convertHandlers().then((result) => {
      if (!result || result.deploymentConfigUpdated) return
      const facts = describeHandlerDeclarations(result.declarations)
      if (facts.length > 0) {
        // Instructions to act on: as long as a toast with an action.
        actionToast.info(`Declare in the deployment config before deploying: ${facts.join('; ')}`, {
          description: 'There is no stored deployment config yet to carry them.',
          duration: LONG_TOAST_MS,
        })
      }
    })
  }

  function handleRename(to: string) {
    const from = dialogTarget
    closeDialog()
    if (!from) return
    void projectFiles.renameFile(from, to).then((renamed) => {
      if (!renamed) return
      // The tree can only focus the renamed row while it is showing.
      useIdeLayoutStore.getState().showSideBar('explorer')
      useIdeExplorerStore.getState().requestFocus(to)
    })
  }

  function handleDelete() {
    const path = dialogTarget
    closeDialog()
    if (path) void projectFiles.deleteFile(path)
  }

  // Save, then close: a tab whose save failed stays open, dirty dot and all,
  // because closing it would drop the only copy of the edit.
  function handleCloseSave(dirtyPaths: string[], paths: string[]) {
    void Promise.all(dirtyPaths.map((path) => projectFiles.saveFile(path))).then((results) => {
      // Cancel pressed while the save ran: the saves stand, the tabs stay.
      if (useIdeStore.getState().closeRequest === null) return
      const failed = dirtyPaths.filter((_, index) => !results[index])
      if (failed.length === 0) {
        closeFiles(paths)
        return
      }
      useIdeStore.getState().cancelClose()
      const names = failed.map(basename).join(', ')
      actionToast.error(
        `Couldn’t save ${names}, so ${failed.length === 1 ? 'its tab' : 'their tabs'} stayed open.`,
        {
          description: 'Your changes are still here.',
        },
      )
    })
  }

  function handleCloseDiscard(dirtyPaths: string[], paths: string[]) {
    for (const path of dirtyPaths) clearDraft(path)
    closeFiles(paths)
  }

  function handleReview(path?: string) {
    useIdeStore.getState().openReview(path)
  }

  return (
    <>
      <FilePathDialog
        key={`rename:${dialogTarget ?? ''}:${dialog === 'renameFile'}`}
        open={dialog === 'renameFile'}
        title="Rename file"
        description="Imports of the old path aren’t updated."
        submitLabel="Rename"
        initialPath={dialogTarget ?? ''}
        existingPaths={renameExisting}
        busy={projectFiles.busy}
        onOpenChange={handleDialogOpenChange}
        onSubmit={handleRename}
      />
      <ConfirmDialog
        open={dialog === 'deleteFile'}
        onOpenChange={handleDialogOpenChange}
        title={`Delete ${dialogTarget ? basename(dialogTarget) : 'file'}?`}
        description={`Deletes ${dialogTarget ?? 'the file'}. Anything that imports it won’t build until you update it.`}
        confirmLabel="Delete"
        loading={projectFiles.busy}
        onConfirm={handleDelete}
      />
      <ConfirmDialog
        open={dialog === 'convertHandlers'}
        onOpenChange={handleDialogOpenChange}
        title="Convert to handler modules?"
        description={describeConversion(conversionPreview.data, conversionPreview.error)}
        confirmLabel="Convert"
        variant="warning"
        loading={projectFiles.busy || conversionPreview.isPending}
        onConfirm={handleConvert}
      />
      <CloseDirtyDialog
        saving={projectFiles.busy}
        onSave={handleCloseSave}
        onDiscard={handleCloseDiscard}
        onReview={handleReview}
      />
    </>
  )
}

interface Location {
  pathname: string
  search: unknown
}

/** The shape of the router's blocker resolver that this dialog uses. */
export type UnsavedBlocker =
  | { status: 'blocked'; current: Location; next: Location; proceed: () => void; reset: () => void }
  | {
      status: 'idle'
      current?: undefined
      next?: undefined
      proceed?: undefined
      reset?: undefined
    }

interface WorkspaceUnsavedDialogProps {
  /** The router's blocker for this workspace; it must live above the early returns. */
  blocker: UnsavedBlocker
  dirtyCount: number
  canEdit: boolean
  /** Review… needs somewhere to look, so it is offered only where the workspace is shown. */
  wideEnough: boolean
  saving: boolean
  saveAll: () => Promise<number>
}

/**
 * The question that stands between unsaved work and leaving. Also shown in the
 * narrow-window notice: the blocker still guards unsaved drafts there, and a
 * blocked navigation with no dialog is a dead end.
 */
export function WorkspaceUnsavedDialog({
  blocker,
  dirtyCount,
  canEdit,
  wideEnough,
  saving,
  saveAll,
}: WorkspaceUnsavedDialogProps) {
  // Opening the canvas is a switch, not a departure: the work stays, it just
  // needs saving first to be visible over there.
  const switchTarget =
    blocker.status === 'blocked'
      ? surfaceSwitchTarget({ current: blocker.current, next: blocker.next })
      : null
  const unsavedSentence =
    dirtyCount === 1 ? 'One file has unsaved changes.' : `${dirtyCount} files have unsaved changes.`

  function handleBlockerCancel() {
    blocker.reset?.()
  }

  // Leaving without saving is a decision to drop the edits: forget the stored
  // copy too, or the next visit would "restore" what the dialog said was lost.
  function handleLeave() {
    useIdeStore.getState().clearDrafts()
    blocker.proceed?.()
  }

  function handleSaveAndSwitch() {
    const pending = dirtyCount
    void saveAll().then((saved) => {
      // Every dirty path is a real write, so a shortfall means one failed —
      // it has toasted why, and switching would hide both the error and the
      // file still holding the change.
      if (saved === pending) blocker.proceed?.()
      else blocker.reset?.()
    })
  }

  // Review… in the leave dialog: stay, and look at what would be lost.
  function handleReviewFromLeave() {
    blocker.reset?.()
    useIdeStore.getState().openReview()
  }

  return (
    <UnsavedChangesDialog
      open={blocker.status === 'blocked'}
      unsaved={unsavedSentence}
      switchTarget={switchTarget}
      canSave={canEdit}
      saving={saving}
      onCancel={handleBlockerCancel}
      onSaveAndGo={handleSaveAndSwitch}
      onDiscardAndGo={handleLeave}
      {...(wideEnough && canEdit && { onReview: handleReviewFromLeave })}
    />
  )
}
