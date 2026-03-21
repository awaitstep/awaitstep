import { ConfirmDialog } from '../ui/confirm-dialog'
import { DeployDialog } from './deploy-dialog'

export interface EditorDialogsProps {
  confirmAction: 'switch-template' | null
  setConfirmAction: (action: 'switch-template' | null) => void
  onConfirmSwitchTemplate: () => void
  blockerStatus: 'blocked' | 'idle' | 'proceeding'
  onBlockerProceed: (() => void) | undefined
  onBlockerReset: (() => void) | undefined
  deployOpen: boolean
  onCloseDeploy: () => void
  workflowId: string
}

export function EditorDialogs({
  confirmAction,
  setConfirmAction,
  onConfirmSwitchTemplate,
  blockerStatus,
  onBlockerProceed,
  onBlockerReset,
  deployOpen,
  onCloseDeploy,
  workflowId,
}: EditorDialogsProps) {
  return (
    <>
      <ConfirmDialog
        open={confirmAction === 'switch-template'}
        onOpenChange={(open) => { if (!open) setConfirmAction(null) }}
        title="Switch template?"
        description="Your current canvas will be replaced. Any unsaved work will be lost."
        confirmLabel="Browse templates"
        variant="warning"
        onConfirm={() => {
          setConfirmAction(null)
          onConfirmSwitchTemplate()
        }}
      />
      <ConfirmDialog
        open={blockerStatus === 'blocked'}
        onOpenChange={(open) => { if (!open) onBlockerReset?.() }}
        title="Unsaved changes"
        description="You have unsaved changes that will be lost if you leave this page."
        confirmLabel="Leave"
        variant="warning"
        onConfirm={() => onBlockerProceed?.()}
      />
      {deployOpen && (
        <DeployDialog
          onClose={onCloseDeploy}
          workflowId={workflowId}
        />
      )}
    </>
  )
}
