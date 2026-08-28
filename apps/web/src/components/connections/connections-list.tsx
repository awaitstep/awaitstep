import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Trash2, Pencil } from 'lucide-react'
import { Button } from '../ui/button'
import { ConfirmDialog } from '../ui/confirm-dialog'
import { api } from '../../lib/api-client'
import { useConnectionsStore } from '../../stores/connections-store'
import { getProvider } from '../../lib/provider-registry'
import { useShallow } from 'zustand/react/shallow'
import { LoadingView } from '../ui/loading-view'
import { LoadMoreButton } from '../ui/load-more-button'
import { ListSkeleton } from '../ui/skeletons'
import { EmptyState } from '../ui/empty-state'
import { Cable } from 'lucide-react'

export function ConnectionsList({
  onEdit,
}: {
  onEdit: (connection: { id: string; name: string; accountId: string }) => void
}) {
  const queryClient = useQueryClient()
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)

  const { isLoading, connections, hasMore, loadMore, isFetchingMore } = useConnectionsStore(
    useShallow((s) => ({
      isLoading: s.fetchState === 'idle' || s.fetchState === 'loading',
      connections: s.connections,
      hasMore: s.hasMore,
      loadMore: s.loadMore,
      isFetchingMore: s.isFetchingMore,
    })),
  )

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteConnection(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connections'] })
    },
  })

  function handleDeleteOpenChange(open: boolean) {
    if (!open) setDeleteTarget(null)
  }

  return (
    <>
      <LoadingView isLoading={isLoading} LoadingPlaceholder={ListSkeleton}>
        {connections.length === 0 ? (
          <div className="mt-6">
            <EmptyState
              icon={Cable}
              title="No connections"
              description="Connect a deployment provider to start deploying your workflows."
            />
          </div>
        ) : (
          <>
            <div className="mt-5 divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
              {connections.map((conn) => (
                <div
                  key={conn.id}
                  className="flex items-center justify-between px-4 py-3 transition-colors hover:bg-muted/20"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2.5">
                      <span className="text-sm font-medium text-foreground">{conn.name}</span>
                      <span className="text-2xs uppercase tracking-wide text-muted-foreground/60">
                        {getProvider(conn.provider)?.name ?? conn.provider}
                      </span>
                    </div>
                    <p className="mt-0.5 font-mono text-2xs text-muted-foreground/50">
                      {conn.credentials.accountId}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      onClick={() =>
                        onEdit({
                          id: conn.id,
                          name: conn.name,
                          accountId: conn.credentials.accountId,
                        })
                      }
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-status-error"
                      onClick={() => setDeleteTarget({ id: conn.id, name: conn.name })}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <LoadMoreButton
              hasMore={hasMore}
              loading={isFetchingMore}
              onClick={() => loadMore?.()}
            />
          </>
        )}
      </LoadingView>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={handleDeleteOpenChange}
        title="Delete connection"
        description={`This will permanently delete the connection "${deleteTarget?.name}". Workflows deployed with this connection will continue running.`}
        confirmLabel="Delete"
        variant="destructive"
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (deleteTarget) {
            deleteMutation.mutate(deleteTarget.id, { onSettled: () => setDeleteTarget(null) })
          }
        }}
      />
    </>
  )
}
