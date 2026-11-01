import { Link } from '@tanstack/react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { defineToast } from '../../lib/action-toast'
import { Hash, MoreVertical, Lock, Unlock, Rocket, RotateCcw, Eye, Trash2 } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '../ui/dropdown-menu'
import { useNavigate } from '@tanstack/react-router'
import {
  api,
  type VersionSummary,
  type DeploymentSummary,
  type WorkflowSummary,
} from '../../lib/api-client'
import { timeAgo } from '../../lib/time'
import { LoadMoreButton } from '../ui/load-more-button'

/**
 * Why the latest of these actions failed, while it is the latest; the toast
 * only says that it did. A later action that works clears it.
 */
export function latestFailure(
  actions: readonly { submittedAt: number; error: Error | null }[],
): Error | null {
  const latest = actions
    .filter((a) => a.submittedAt > 0)
    .reduce<(typeof actions)[number] | null>(
      (last, a) => (!last || a.submittedAt > last.submittedAt ? a : last),
      null,
    )
  return latest?.error ?? null
}

interface VersionListProps {
  workflowId: string
  workflow: WorkflowSummary
  versions: VersionSummary[]
  activeDeployment: DeploymentSummary | undefined
  deployBlocked: boolean
  hasMore?: boolean
  loadingMore?: boolean
  onLoadMore?: () => void
}

export function VersionList({
  workflowId,
  workflow,
  versions,
  activeDeployment,
  deployBlocked,
  hasMore,
  loadingMore,
  onLoadMore,
}: VersionListProps) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const lockVersionMutation = useMutation({
    meta: {
      toast: defineToast<{ versionId: string; locked: boolean }>({
        success: (v) => (v.locked ? 'Version locked' : 'Version unlocked'),
        error: (v) => `Couldn’t ${v.locked ? 'lock' : 'unlock'} the version`,
      }),
    },
    mutationFn: ({ versionId, locked }: { versionId: string; locked: boolean }) =>
      api.lockVersion(workflowId, versionId, locked),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['versions', workflowId] })
    },
  })

  const revertMutation = useMutation({
    meta: { toast: { success: 'Reverted to a new version', error: 'Couldn’t revert the version' } },
    mutationFn: (versionId: string) => api.revertToVersion(workflowId, versionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['versions', workflowId] })
      queryClient.invalidateQueries({ queryKey: ['workflow', workflowId] })
    },
  })

  const deleteVersionMutation = useMutation({
    meta: { toast: { success: 'Version deleted', error: 'Couldn’t delete the version' } },
    mutationFn: (versionId: string) => api.deleteVersion(workflowId, versionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['versions', workflowId] })
    },
  })

  const failure = latestFailure([lockVersionMutation, revertMutation, deleteVersionMutation])

  return (
    <section>
      <h2 className="text-sm font-semibold text-foreground/70">Versions</h2>
      {failure && (
        <p role="alert" className="mt-1 text-xs text-destructive">
          {failure.message}
        </p>
      )}
      {versions.length > 0 ? (
        <div className="mt-3 rounded-md border border-border">
          {versions.map((v, i) => {
            const isActive = v.id === activeDeployment?.versionId
            const isLocked = v.locked === 1
            return (
              <div
                key={v.id}
                className={`flex items-center justify-between px-3 py-2.5 ${
                  i < versions.length - 1 ? 'border-b border-border' : ''
                }`}
              >
                <div className="flex items-center gap-1.5 text-xs text-foreground/60">
                  <Hash className="h-3 w-3 text-muted-foreground/40" />v{v.version}
                  {isLocked && <Lock className="h-3 w-3 text-muted-foreground/60" />}
                  {isActive && (
                    <span className="rounded bg-status-success/10 px-1.5 py-0.5 text-xs font-medium text-status-success">
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
                            navigate({
                              to: '/workflows/$workflowId/deploy',
                              params: { workflowId },
                            })
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
                          to="/workflows/$workflowId/editor"
                          params={{ workflowId }}
                          search={{ view: 'canvas', version: v.id }}
                        >
                          <Eye className="h-3.5 w-3.5" />
                          View in canvas
                        </Link>
                      </DropdownMenuItem>
                      {!isLocked && !isActive && v.id !== workflow.currentVersionId && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive hover:text-destructive/80 focus:text-destructive/80"
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
          {hasMore && onLoadMore && (
            <LoadMoreButton hasMore={hasMore} loading={!!loadingMore} onClick={onLoadMore} />
          )}
        </div>
      ) : (
        <div className="mt-3 rounded-md border border-border px-4 py-6 text-center text-xs text-muted-foreground">
          No versions yet. Open the editor to create one.
        </div>
      )}
    </section>
  )
}
