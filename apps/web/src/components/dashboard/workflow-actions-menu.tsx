import { useState, type ReactNode } from 'react'
import { failureLine } from '../../lib/action-toast'
import { useNavigate } from '@tanstack/react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { MoreHorizontal, Rocket, Activity, Copy, Download, Trash2, CloudOff } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '../ui/dropdown-menu'
import { ConfirmDialog } from '../ui/confirm-dialog'
import { api, type WorkflowSummary } from '../../lib/api-client'
import { downloadJsonFile } from '../../lib/download-file'

interface WorkflowActionsMenuProps {
  workflow: WorkflowSummary
  isDeployed?: boolean
}

function irFileName(name: string) {
  return `${name.replace(/\s+/g, '-').toLowerCase()}.ir.json`
}

export function WorkflowActionsMenu({ workflow, isDeployed }: WorkflowActionsMenuProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [takedownOpen, setTakedownOpen] = useState(false)

  const deleteMutation = useMutation({
    meta: { toast: { success: 'Workflow deleted', error: 'Couldn’t delete the workflow' } },
    mutationFn: () => api.deleteWorkflow(workflow.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] })
      queryClient.invalidateQueries({ queryKey: ['all-deployments'] })

      navigate({ to: '/workflows', replace: true }).finally(() => setDeleteOpen(false))
    },
  })

  const takedownMutation = useMutation({
    meta: { toast: { success: 'Workflow taken down', error: 'Couldn’t take down the workflow' } },
    mutationFn: async () => {
      const connsResult = await api.listConnections()
      if (connsResult.data.length === 0) throw new Error('No connection available')
      const result = await api.takedownDeployment(workflow.id, connsResult.data[0].id)
      if (!result.success) throw new Error(result.error ?? 'Failed to take down workflow')
      return result
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] })
      queryClient.invalidateQueries({ queryKey: ['all-deployments'] })
      setTakedownOpen(false)
    },
  })

  const duplicateMutation = useMutation({
    meta: {
      toast: {
        success: 'Workflow duplicated',
        error: 'Couldn’t duplicate the workflow',
      },
    },
    mutationFn: async () => {
      const newWf = await api.createWorkflow({
        name: `${workflow.name} (copy)`,
        description: workflow.description,
        kind: workflow.kind,
      })
      if (workflow.currentVersionId) {
        const ver = await api.getVersion(workflow.id, workflow.currentVersionId)
        await api.createVersion(newWf.id, { ir: JSON.parse(ver.ir) })
      }
      return newWf
    },
    onSuccess: (newWf) => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] })
      navigate({ to: '/workflows/$workflowId', params: { workflowId: newWf.id } })
    },
  })

  const exportMutation = useMutation({
    meta: {
      toast: {
        success: 'Workflow exported',
        error: 'Couldn’t export the workflow',
      },
    },
    mutationFn: async () => {
      if (!workflow.currentVersionId) throw new Error('No version to export')
      const ver = await api.getVersion(workflow.id, workflow.currentVersionId)
      return ver.ir
    },
    onSuccess: (irJson) => {
      downloadJsonFile(irFileName(workflow.name), irJson)
    },
  })

  const hasVersion = !!workflow.currentVersionId

  // Reopened, a dialog starts without the last attempt's failure.
  function handleAskDelete() {
    deleteMutation.reset()
    setDeleteOpen(true)
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
          <DropdownMenuItem
            onSelect={() =>
              navigate({
                to: '/workflows/$workflowId/deployments',
                params: { workflowId: workflow.id },
              })
            }
          >
            <Rocket size={14} /> Deployments
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() =>
              navigate({ to: '/workflows/$workflowId/runs', params: { workflowId: workflow.id } })
            }
          >
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
          onConfirm={() => deleteMutation.mutate()}
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
          onConfirm={() => takedownMutation.mutate()}
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
