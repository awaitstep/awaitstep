import { useState, type ReactNode } from 'react'
import { failureLine } from '../../lib/action-toast'
import { MoreHorizontal, Rocket, Activity, Copy, Download, Trash2, CloudOff } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '../ui/dropdown-menu'
import { ConfirmDialog } from '../ui/confirm-dialog'
import type { WorkflowSummary } from '../../lib/api-client'
import { useWorkflowLinks } from '../../lib/workflows/detail-links'
import { useGoTo } from '../navigation/router-shell-link'
import { useWorkflowActions } from './use-workflow-actions'

interface WorkflowActionsMenuProps {
  workflow: WorkflowSummary
  isDeployed?: boolean
}

export function WorkflowActionsMenu({ workflow, isDeployed }: WorkflowActionsMenuProps) {
  const goTo = useGoTo()
  const links = useWorkflowLinks(workflow.id)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [takedownOpen, setTakedownOpen] = useState(false)
  const {
    remove: deleteMutation,
    takedown: takedownMutation,
    duplicate: duplicateMutation,
    exportIr: exportMutation,
  } = useWorkflowActions(workflow)

  const hasVersion = !!workflow.currentVersionId

  // Reopened, a dialog starts without the last attempt's failure.
  function handleAskDelete() {
    deleteMutation.reset()
    setDeleteOpen(true)
  }

  function handleConfirmDelete() {
    deleteMutation.mutate(undefined, { onSuccess: () => setDeleteOpen(false) })
  }

  function handleConfirmTakedown() {
    takedownMutation.mutate(undefined, { onSuccess: () => setTakedownOpen(false) })
  }

  function handleAskTakedown() {
    takedownMutation.reset()
    setTakedownOpen(true)
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="rounded-md p-1 text-muted-foreground/60 transition-colors hover:bg-muted/60 hover:text-foreground/60"
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal size={16} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem onSelect={() => goTo(links.deployments)}>
            <Rocket size={14} /> Deployments
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => goTo(links.runs)}>
            <Activity size={14} /> Runs
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => duplicateMutation.mutate()}
            disabled={duplicateMutation.isPending || !hasVersion}
          >
            <Copy size={14} /> Duplicate
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => exportMutation.mutate()}
            disabled={exportMutation.isPending || !hasVersion}
          >
            <Download size={14} /> Export IR
          </DropdownMenuItem>
          {isDeployed && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-status-warning hover:text-status-warning/80 focus:text-status-warning/80"
                onSelect={handleAskTakedown}
              >
                <CloudOff size={14} /> Take down
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive hover:text-destructive/80 focus:text-destructive/80"
            onSelect={handleAskDelete}
          >
            <Trash2 size={14} /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {deleteOpen && (
        <ConfirmDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          title="Delete workflow"
          description={
            <WithError error={deleteMutation.error} general="Couldn’t delete the workflow">
              {`Are you sure you want to delete "${workflow.name}"? This action cannot be undone.`}
            </WithError>
          }
          confirmLabel="Delete"
          variant="destructive"
          onConfirm={handleConfirmDelete}
          loading={deleteMutation.isPending}
        />
      )}

      {takedownOpen && (
        <ConfirmDialog
          open={takedownOpen}
          onOpenChange={setTakedownOpen}
          title="Take down deployment"
          description={
            <WithError error={takedownMutation.error} general="Couldn’t take down the workflow">
              {`This will delete the worker for "${workflow.name}" from Cloudflare. The workflow will remain in your account but will no longer be running.`}
            </WithError>
          }
          confirmLabel="Take down"
          variant="warning"
          onConfirm={handleConfirmTakedown}
          loading={takedownMutation.isPending}
        />
      )}
    </>
  )
}

/** A confirm dialog's text with the reason the last attempt failed under it. */
function WithError({
  error,
  general,
  children,
}: {
  error: Error | null
  /** Said instead of a server failure's own text (see `failureLine`). */
  general: string
  children: ReactNode
}) {
  return (
    <>
      {children}
      {error && (
        <span role="alert" className="mt-2 block text-destructive">
          {failureLine(error, general)}
        </span>
      )}
    </>
  )
}
