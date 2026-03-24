import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Hash, MoreVertical, Lock, Unlock, Rocket, RotateCcw, Eye, Trash2 } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '../ui/dropdown-menu'
import { DeployDialog } from '../canvas/deploy-dialog'
import {
  api,
  type VersionSummary,
  type DeploymentSummary,
  type WorkflowSummary,
} from '../../lib/api-client'
import { timeAgo } from '../../lib/time'

interface VersionListProps {
  workflowId: string
  workflow: WorkflowSummary
  versions: VersionSummary[]
  activeDeployment: DeploymentSummary | undefined
  deployBlocked: boolean
}

export function VersionList({
  workflowId,
  workflow,
  versions,
  activeDeployment,
  deployBlocked,
}: VersionListProps) {
  const queryClient = useQueryClient()
  const [deployOpen, setDeployOpen] = useState(false)
  const [deployVersionId, setDeployVersionId] = useState<string | undefined>(undefined)

  const lockVersionMutation = useMutation({
    mutationFn: ({ versionId, locked }: { versionId: string; locked: boolean }) =>
      api.lockVersion(workflowId, versionId, locked),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['versions', workflowId] })
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : 'Failed to update version lock'),
  })

  const revertMutation = useMutation({
    mutationFn: (versionId: string) => api.revertToVersion(workflowId, versionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['versions', workflowId] })
      queryClient.invalidateQueries({ queryKey: ['workflow', workflowId] })
      toast.success('Reverted successfully — new version created')
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to revert'),
  })

  const deleteVersionMutation = useMutation({
    mutationFn: (versionId: string) => api.deleteVersion(workflowId, versionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['versions', workflowId] })
      toast.success('Version deleted')
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to delete version'),
  })

  return (
    <section>
      <h2 className="text-sm font-semibold text-foreground/70">Versions</h2>
      {versions.length > 0 ? (
        <div className="mt-3 rounded-md border border-border">
          {versions.slice(0, 10).map((v, i) => {
            const isActive = v.id === activeDeployment?.versionId
            const isLocked = v.locked === 1
            return (
              <div
                key={v.id}
                className={`flex items-center justify-between px-3 py-2.5 ${
                  i < Math.min(versions.length, 10) - 1 ? 'border-b border-border' : ''
                }`}
              >
                <div className="flex items-center gap-1.5 text-xs text-foreground/60">
                  <Hash className="h-3 w-3 text-muted-foreground/40" />v{v.version}
                  {isLocked && <Lock className="h-3 w-3 text-muted-foreground/60" />}
                  {isActive && (
                    <span className="rounded bg-status-success/10 px-1.5 py-0.5 text-[10px] font-medium text-status-success">
                      deployed
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground/60">{timeAgo(v.createdAt)}</span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="rounded p-0.5 text-muted-foreground/40 hover:bg-muted/60 hover:text-muted-foreground">
                        <MoreVertical className="h-3.5 w-3.5" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {!isActive && !isLocked && !deployBlocked && (
                        <DropdownMenuItem
                          onSelect={() => {
                            setDeployVersionId(v.id)
                            setDeployOpen(true)
                          }}
                        >
                          <Rocket className="h-3.5 w-3.5" />
                          Deploy this version
                        </DropdownMenuItem>
                      )}
                      {!isActive && !isLocked && deployBlocked && (
                        <DropdownMenuItem onSelect={() => revertMutation.mutate(v.id)}>
                          <RotateCcw className="h-3.5 w-3.5" />
                          Revert to this version
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        onSelect={() =>
                          lockVersionMutation.mutate({ versionId: v.id, locked: !isLocked })
                        }
                      >
                        {isLocked ? (
                          <Unlock className="h-3.5 w-3.5" />
                        ) : (
                          <Lock className="h-3.5 w-3.5" />
                        )}
                        {isLocked ? 'Unlock' : 'Lock'}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem asChild>
                        <Link
                          to="/workflows/$workflowId/canvas"
                          params={{ workflowId }}
                          search={{ version: v.id }}
                        >
                          <Eye className="h-3.5 w-3.5" />
                          View in canvas
                        </Link>
                      </DropdownMenuItem>
                      {!isLocked && !isActive && v.id !== workflow.currentVersionId && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-red-400 hover:text-red-300 focus:text-red-300"
                            onSelect={() => deleteVersionMutation.mutate(v.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Delete
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="mt-3 rounded-md border border-border px-4 py-6 text-center text-xs text-muted-foreground">
          No versions yet. Open the editor to create one.
        </div>
      )}
      {deployOpen && (
        <DeployDialog
          onClose={() => setDeployOpen(false)}
          workflowId={workflowId}
          versionId={deployVersionId}
        />
      )}
    </section>
  )
}
