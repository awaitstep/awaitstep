import { ConfirmDialog } from '../ui/confirm-dialog'

export interface EditorDialogsProps {
  confirmAction: 'switch-template' | null
  setConfirmAction: (action: 'switch-template' | null) => void
  onConfirmSwitchTemplate: () => void
  blockerStatus: 'blocked' | 'idle'
  onBlockerProceed: (() => void) | undefined
  onBlockerReset: (() => void) | undefined
}

export function EditorDialogs({
  confirmAction,
  setConfirmAction,
  onConfirmSwitchTemplate,
  blockerStatus,
  onBlockerProceed,
  onBlockerReset,
}: EditorDialogsProps) {
  function handleSwitchTemplateOpenChange(open: boolean) {
    if (!open) setConfirmAction(null)
  }

  function handleSwitchTemplateConfirm() {
    setConfirmAction(null)
    onConfirmSwitchTemplate()
  }

  function handleBlockerOpenChange(open: boolean) {
    if (!open) onBlockerReset?.()
  }

  function handleBlockerConfirm() {
    onBlockerProceed?.()
  }

  return (
    <>
      <ConfirmDialog
        open={confirmAction === 'switch-template'}
        onOpenChange={handleSwitchTemplateOpenChange}
        title="Switch template?"
        description="Your current canvas will be replaced. Any unsaved work will be lost."
        confirmLabel="Browse templates"
        variant="warning"
        onConfirm={handleSwitchTemplateConfirm}
      />
      <ConfirmDialog
        open={blockerStatus === 'blocked'}
        onOpenChange={handleBlockerOpenChange}
        title="Unsaved changes"
        description="You have unsaved changes that will be lost if you leave this page."
        confirmLabel="Leave"
        variant="warning"
        onConfirm={handleBlockerConfirm}
      />
    </>
  )
}
