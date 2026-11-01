import { ConfirmDialog } from '../ui/confirm-dialog'
import { UnsavedChangesDialog } from '../workflows/unsaved-changes-dialog'
import type { WorkspaceSurface } from '../../lib/workflows/surfaces'

export interface EditorDialogsProps {
  confirmAction: 'switch-template' | null
  setConfirmAction: (action: 'switch-template' | null) => void
  onConfirmSwitchTemplate: () => void
  blockerStatus: 'blocked' | 'idle'
  onBlockerProceed: (() => void) | undefined
  onBlockerReset: (() => void) | undefined
  /** Set when the blocked navigation is the move to the code workspace. */
  switchTarget: WorkspaceSurface | null
  /** This version accepts a save (an older version does not). */
  canSave: boolean
  onSaveAndSwitch: () => void
  isSaving: boolean
}

export function EditorDialogs({
  confirmAction,
  setConfirmAction,
  onConfirmSwitchTemplate,
  blockerStatus,
  onBlockerProceed,
  onBlockerReset,
  switchTarget,
  canSave,
  onSaveAndSwitch,
  isSaving,
}: EditorDialogsProps) {
  function handleSwitchTemplateOpenChange(open: boolean) {
    if (!open) setConfirmAction(null)
  }

  function handleSwitchTemplateConfirm() {
    setConfirmAction(null)
    onConfirmSwitchTemplate()
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
        onOpenChange={handleSwitchTemplateOpenChange}
        title="Switch template?"
        description="This replaces the current canvas. Unsaved changes are lost."
        confirmLabel="Browse templates"
        variant="warning"
        onConfirm={handleSwitchTemplateConfirm}
      />
      <UnsavedChangesDialog
        open={blockerStatus === 'blocked'}
        unsaved="The canvas has unsaved changes."
        switchTarget={switchTarget}
        canSave={canSave}
        saving={isSaving}
        onCancel={handleCancel}
        onSaveAndGo={onSaveAndSwitch}
        onDiscardAndGo={handleDiscardAndGo}
      />
    </>
  )
}
