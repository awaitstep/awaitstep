import { useState } from 'react'
import { useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { Button } from '../ui/button'
import { ConfirmDialog } from '../ui/confirm-dialog'
import { api } from '../../lib/api-client'
import { queries, flatPages } from '../../lib/queries'
import { useOrgReady } from '../../stores/org-store'
import { LoadMoreButton } from '../ui/load-more-button'
import { ApiKeyRow } from './api-key-row'
import { CreateKeyDialog } from './create-key-dialog'
import { KeyCreatedDialog } from './key-created-dialog'
import type { ApiKeyCreated } from '../../lib/api-client'
import { toast } from 'sonner'

function ApiKeySkeleton() {
  return (
    <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <div className="h-3 w-20 animate-pulse rounded bg-muted/60" />
          <div className="h-3 w-14 animate-pulse rounded bg-muted/40" />
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-2.5 w-10 animate-pulse rounded bg-muted/40" />
          <div className="h-2.5 w-16 animate-pulse rounded bg-muted/40" />
        </div>
      </div>
      <div className="h-7 w-16 animate-pulse rounded bg-muted/40" />
    </div>
  )
}

/**
 * Every key of the organization, with its level — and the place organization
 * keys are created. Project keys are created on their project's row in the
 * Projects section.
 */
export function ApiKeysSection() {
  const ready = useOrgReady()
  const [createOpen, setCreateOpen] = useState(false)
  const [revokeTarget, setRevokeTarget] = useState<string | null>(null)
  const [createdKey, setCreatedKey] = useState<ApiKeyCreated | null>(null)
  const queryClient = useQueryClient()

  const {
    data: keysData,
    isLoading,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({ ...queries.apiKeys.list(), enabled: ready })
  const keys = flatPages(keysData)

  const revokeMutation = useMutation({
    mutationFn: (id: string) => api.revokeApiKey(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] })
      toast.success('API key revoked')
    },
    onError: (err) => toast.error(err.message),
  })

  // The endpoint returns live keys only, each with its project's name joined
  // in — no client-side filtering or name lookups.
  const activeKeys = keys ?? []

  function handleKeyCreated(key: ApiKeyCreated) {
    setCreateOpen(false)
    setCreatedKey(key)
    queryClient.invalidateQueries({ queryKey: ['api-keys'] })
  }

  function handleRevokeOpenChange(open: boolean) {
    if (!open) setRevokeTarget(null)
  }

  function handleConfirmRevoke() {
    if (!revokeTarget) return
    revokeMutation.mutate(revokeTarget, { onSettled: () => setRevokeTarget(null) })
  }

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
          API Keys
        </h2>
        <Button size="sm" className="h-7 gap-1.5 text-xs" onClick={() => setCreateOpen(true)}>
          <Plus className="h-3 w-3" />
          New org key
        </Button>
      </div>

      <p className="mt-1 text-xs text-muted-foreground/60">
        Org keys manage organization resources; project keys work their project only — create those
        on a project in the Projects section.
      </p>

      {isLoading ? (
        <div className="mt-3 space-y-1.5">
          <ApiKeySkeleton />
          <ApiKeySkeleton />
        </div>
      ) : activeKeys.length === 0 ? (
        <div className="mt-3 rounded-md border border-dashed border-border py-6 text-center">
          <p className="text-xs text-muted-foreground">No API keys yet</p>
          <p className="mt-0.5 text-xs text-muted-foreground/60">
            Create a key for programmatic access
          </p>
        </div>
      ) : (
        <div className="mt-3 space-y-1.5">
          {activeKeys.map((key) => (
            <ApiKeyRow
              key={key.id}
              apiKey={key}
              badge={key.projectName ?? 'Org'}
              onRevoke={setRevokeTarget}
            />
          ))}
          <LoadMoreButton
            hasMore={!!hasNextPage}
            loading={isFetchingNextPage}
            onClick={() => fetchNextPage()}
          />
        </div>
      )}

      <CreateKeyDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={handleKeyCreated}
        target={{ level: 'org' }}
      />
      <KeyCreatedDialog apiKey={createdKey} onClose={() => setCreatedKey(null)} />
      <ConfirmDialog
        open={!!revokeTarget}
        onOpenChange={handleRevokeOpenChange}
        title="Revoke API key"
        description="This key will immediately stop working. Any applications using it will lose access."
        confirmLabel="Revoke"
        variant="destructive"
        loading={revokeMutation.isPending}
        onConfirm={handleConfirmRevoke}
      />
    </section>
  )
}
