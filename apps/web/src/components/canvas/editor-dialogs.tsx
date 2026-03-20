import { toast } from 'sonner'
import { ConfirmDialog } from '../ui/confirm-dialog'
import { TriggerDialog } from './trigger-dialog'
import { TriggerCodeDialog } from './trigger-code-dialog'
import { DeployDialog } from './deploy-dialog'
import { api } from '../../lib/api-client'

export interface EditorDialogsProps {
  confirmAction: 'delete' | 'takedown' | 'switch-template' | null
  setConfirmAction: (action: 'delete' | 'takedown' | 'switch-template' | null) => void
  onConfirmDelete: (options: { onSettled: () => void }) => void
  isDeleting: boolean
  onConfirmTakedown: (connectionId: string, options: { onSettled: () => void }) => void
  isTakingDown: boolean
  onConfirmSwitchTemplate: () => void
  blockerStatus: 'blocked' | 'idle' | 'proceeding'
  onBlockerProceed: (() => void) | undefined
  onBlockerReset: (() => void) | undefined
  showTrigger: boolean
  onCloseTrigger: () => void
  showEntryEditor: boolean
  onCloseEntryEditor: () => void
  deployOpen: boolean
  onCloseDeploy: () => void
  workflowId: string
  activeDeploymentServiceName: string | undefined
}

export function EditorDialogs({
  confirmAction,
  setConfirmAction,
  onConfirmDelete,
  isDeleting,
  onConfirmTakedown,
  isTakingDown,
  onConfirmSwitchTemplate,
  blockerStatus,
  onBlockerProceed,
  onBlockerReset,
  showTrigger,
  onCloseTrigger,
  showEntryEditor,
  onCloseEntryEditor,
  deployOpen,
  onCloseDeploy,
  workflowId,
  activeDeploymentServiceName,
}: EditorDialogsProps) {
  return (
    <>
      <ConfirmDialog
        open={confirmAction === 'delete'}
        onOpenChange={(open) => { if (!open) setConfirmAction(null) }}
        title="Delete workflow"
        description="This will permanently delete this workflow and all its versions. This cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        loading={isDeleting}
        onConfirm={() => {
          onConfirmDelete({ onSettled: () => setConfirmAction(null) })
        }}
      />
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
        open={confirmAction === 'takedown'}
        onOpenChange={(open) => { if (!open) setConfirmAction(null) }}
        title="Take down deployment"
        description="This will delete the worker from Cloudflare. The workflow will remain in your account but will no longer be running."
        confirmLabel="Take down"
        variant="warning"
        loading={isTakingDown}
        onConfirm={async () => {
          const conns = await api.listConnections()
          if (conns.length === 0) {
            toast.error('No connection available to take down deployment')
            setConfirmAction(null)
            return
          }
          onConfirmTakedown(conns[0].id, { onSettled: () => setConfirmAction(null) })
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
      <TriggerDialog
        open={showTrigger}
        onClose={onCloseTrigger}
        workflowId={workflowId}
        deploymentId={activeDeploymentServiceName}
      />
      <TriggerCodeDialog
        open={showEntryEditor}
        onClose={onCloseEntryEditor}
      />
      <DeployDialog
        open={deployOpen}
        onClose={onCloseDeploy}
        workflowId={workflowId}
      />
    </>
  )
}
