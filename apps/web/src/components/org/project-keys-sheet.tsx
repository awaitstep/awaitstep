import { useState } from 'react'
import { useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query'
import { Plus, X } from 'lucide-react'
import { Sheet, SheetContent, SheetTitle, SheetDescription, SheetClose } from '../ui/sheet'
import { Button } from '../ui/button'
import { ConfirmDialog } from '../ui/confirm-dialog'
import { api } from '../../lib/api-client'
import { queries, flatPages } from '../../lib/queries'
import type { Project } from '../../stores/org-store'
import { LoadMoreButton } from '../ui/load-more-button'
import { ApiKeyRow } from './api-key-row'
import { CreateKeyDialog } from './create-key-dialog'
import { KeyCreatedDialog } from './key-created-dialog'
import type { ApiKeyCreated } from '../../lib/api-client'
import { toast } from 'sonner'

/**
 * A project's API keys, opened from its row in the Projects section. When the
 * workspaces layer lands, the create flow here additionally takes the
 * workspace selection — this sheet is where that selector goes.
 */
export function ProjectKeysSheet({
  project,
  onOpenChange,
}: {
  project: Project | null
  onOpenChange: (open: boolean) => void
}) {
  const [createOpen, setCreateOpen] = useState(false)
  const [revokeTarget, setRevokeTarget] = useState<string | null>(null)
  const [createdKey, setCreatedKey] = useState<ApiKeyCreated | null>(null)
  const queryClient = useQueryClient()

  // Held past close, so the title and list keep their content during the
  // sheet's exit animation instead of going blank.
  const [held, setHeld] = useState(project)
  if (project !== null && project !== held) setHeld(project)

  const {
    data: keysData,
    isLoading,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    ...queries.apiKeys.list(held?.id),
    enabled: project !== null,
  })
  const projectKeys = flatPages(keysData) ?? []

  const revokeMutation = useMutation({
    mutationFn: (id: string) => api.revokeApiKey(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] })
      toast.success('API key revoked')
    },
    onError: (err) => toast.error(err.message),
  })

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
    <Sheet open={project !== null} onOpenChange={onOpenChange}>
      <SheetContent className="p-5">
        <div className="flex items-center justify-between">
          <SheetTitle className="text-sm font-semibold">API keys — {held?.name}</SheetTitle>
          <SheetClose asChild>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
              <X size={14} />
            </Button>
          </SheetClose>
        </div>
        <SheetDescription className="mt-1 text-xs text-muted-foreground/60">
          Project keys work in this project only. Organization keys live in Settings.
        </SheetDescription>

        <div className="mt-4">
          <Button size="sm" className="h-7 gap-1.5 text-xs" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3 w-3" />
            New project key
          </Button>
        </div>

        <div className="mt-3 flex-1 space-y-1.5 overflow-y-auto">
          {isLoading ? (
            <div className="rounded-md border border-dashed border-border py-6 text-center text-xs text-muted-foreground">
              Loading…
            </div>
          ) : projectKeys.length === 0 ? (
            <div className="rounded-md border border-dashed border-border py-6 text-center">
              <p className="text-xs text-muted-foreground">No keys for this project</p>
            </div>
          ) : (
            <>
              {projectKeys.map((key) => (
                <ApiKeyRow key={key.id} apiKey={key} onRevoke={setRevokeTarget} />
              ))}
              <LoadMoreButton
                hasMore={!!hasNextPage}
                loading={isFetchingNextPage}
                onClick={() => fetchNextPage()}
              />
            </>
          )}
        </div>

        {held && (
          <CreateKeyDialog
            open={createOpen}
            onOpenChange={setCreateOpen}
            onCreated={handleKeyCreated}
            target={{ level: 'project', projectId: held.id, projectName: held.name }}
          />
        )}
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
      </SheetContent>
    </Sheet>
  )
}
