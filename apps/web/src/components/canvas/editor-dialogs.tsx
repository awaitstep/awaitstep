import { ConfirmDialog } from '../ui/confirm-dialog'
import { UnsavedChangesDialog } from '../workflows/unsaved-changes-dialog'
import type { WorkspaceSurface } from '../../lib/workflows/surfaces'

/** The questions the canvas asks before an action that drops unsaved work. */
export type CanvasConfirmAction = 'switch-template' | 'reload'

/** What is unsaved, when Code has moved the workflow and a save from here is refused. */
export const CONFLICT_UNSAVED_SENTENCE =
  'This workflow changed in Code, so your canvas edits can’t be saved.'

export interface EditorDialogsProps {
  confirmAction: CanvasConfirmAction | null
  setConfirmAction: (action: CanvasConfirmAction | null) => void
  onConfirmSwitchTemplate: () => void
  /** Reload the saved workflow over the unsaved canvas edits, once confirmed. */
  onConfirmReload: () => void
  blockerStatus: 'blocked' | 'idle'
  onBlockerProceed: (() => void) | undefined
  onBlockerReset: (() => void) | undefined
  /** Set when the blocked navigation is the move to the code workspace. */
  switchTarget: WorkspaceSurface | null
  /** This version accepts a save (an older version does not). */
  canSave: boolean
  /** Code saved this workflow since the canvas loaded it: a save from here is refused, so none is offered. */
  saveConflict: boolean
  onSaveAndSwitch: () => void
  isSaving: boolean
}

export function EditorDialogs({
  confirmAction,
  setConfirmAction,
  onConfirmSwitchTemplate,
  onConfirmReload,
  blockerStatus,
  onBlockerProceed,
  onBlockerReset,
  switchTarget,
  canSave,
  saveConflict,
  onSaveAndSwitch,
  isSaving,
}: EditorDialogsProps) {
  function handleConfirmOpenChange(open: boolean) {
    if (!open) setConfirmAction(null)
  }

  function handleSwitchTemplateConfirm() {
    setConfirmAction(null)
    onConfirmSwitchTemplate()
  }

  function handleReloadConfirm() {
    setConfirmAction(null)
    onConfirmReload()
  }

  function handleCancel() {
    onBlockerReset?.()
  }

  function handleDiscardAndGo() {
    onBlockerProceed?.()
  }

  return (
    <>
      <ConfirmDialog
        open={confirmAction === 'switch-template'}
        onOpenChange={handleConfirmOpenChange}
        title="Switch template?"
        description="This replaces the current canvas. Unsaved changes are lost."
        confirmLabel="Browse templates"
        variant="warning"
        onConfirm={handleSwitchTemplateConfirm}
      />
      <ConfirmDialog
        open={confirmAction === 'reload'}
        onOpenChange={handleConfirmOpenChange}
        title="Discard your unsaved canvas changes?"
        description={`${CONFLICT_UNSAVED_SENTENCE} Reloading replaces them with the saved version.`}
        confirmLabel="Discard and reload"
        variant="warning"
        onConfirm={handleReloadConfirm}
      />
      <UnsavedChangesDialog
        open={blockerStatus === 'blocked'}
        unsaved={saveConflict ? CONFLICT_UNSAVED_SENTENCE : 'The canvas has unsaved changes.'}
        switchTarget={switchTarget}
        canSave={canSave && !saveConflict}
        saving={isSaving}
        onCancel={handleCancel}
        onSaveAndGo={onSaveAndSwitch}
        onDiscardAndGo={handleDiscardAndGo}
      />
    </>
  )
}
