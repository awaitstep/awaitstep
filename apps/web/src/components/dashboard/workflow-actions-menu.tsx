import { useState } from 'react'
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
import { toast } from 'sonner'

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
    mutationFn: () => api.deleteWorkflow(workflow.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] })
      queryClient.invalidateQueries({ queryKey: ['all-deployments'] })
      navigate({ to: '/workflows', replace: true })
      setDeleteOpen(false)
    },
  })

  const takedownMutation = useMutation({
    mutationFn: async () => {
      const connsResult = await api.listConnections()
      if (connsResult.data.length === 0) throw new Error('No connection available')
      return api.takedownDeployment(workflow.id, connsResult.data[0].id)
    },
    onSuccess: (result) => {
      if (!result.success) throw new Error(result.error ?? 'Failed to take down')
      queryClient.invalidateQueries({ queryKey: ['workflows'] })
      queryClient.invalidateQueries({ queryKey: ['all-deployments'] })
      setTakedownOpen(false)
    },
  })

  const duplicateMutation = useMutation({
    mutationFn: async () => {
      const newWf = await api.createWorkflow({
        name: `${workflow.name} (copy)`,
        description: workflow.description,
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
    mutationFn: async () => {
      if (!workflow.currentVersionId) throw new Error('No version to export')
      const ver = await api.getVersion(workflow.id, workflow.currentVersionId)
      return ver.ir
    },
    onSuccess: (irJson) => {
      downloadJsonFile(irFileName(workflow.name), irJson)
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to export workflow')
    },
  })

  const hasVersion = !!workflow.currentVersionId

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
                onSelect={() => setTakedownOpen(true)}
              >
                <CloudOff size={14} /> Take down
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive hover:text-destructive/80 focus:text-destructive/80"
            onSelect={() => setDeleteOpen(true)}
          >
            <Trash2 size={14} /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete workflow"
        description={`Are you sure you want to delete "${workflow.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => deleteMutation.mutate()}
        loading={deleteMutation.isPending}
      />

      <ConfirmDialog
        open={takedownOpen}
        onOpenChange={setTakedownOpen}
        title="Take down deployment"
        description={`This will delete the worker for "${workflow.name}" from Cloudflare. The workflow will remain in your account but will no longer be running.`}
        confirmLabel="Take down"
        variant="warning"
        onConfirm={() => takedownMutation.mutate()}
        loading={takedownMutation.isPending}
      />
    </>
  )
}
