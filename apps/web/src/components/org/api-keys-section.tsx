import { useState, useEffect } from 'react'
import { useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query'
import * as Dialog from '@radix-ui/react-dialog'
import { Loader2, Plus, Copy, Check } from 'lucide-react'
import { Button } from '../ui/button'
import { Select } from '../ui/select'
import { ConfirmDialog } from '../ui/confirm-dialog'
import { DateTimePicker } from '../ui/datetime-picker'
import { api } from '../../lib/api-client'
import { queries, flatPages } from '../../lib/queries'
import { useOrgStore, useOrgReady } from '../../stores/org-store'
import { useShallow } from 'zustand/react/shallow'
import { timeAgo, timeUntil } from '../../lib/time'
import { LoadMoreButton } from '../ui/load-more-button'
import type { ApiKeyCreated } from '../../lib/api-client'
import { toast } from 'sonner'

const SCOPES = [
  { value: 'read', label: 'Read', description: 'View workflows, runs, and connections' },
  { value: 'write', label: 'Write', description: 'Create and modify workflows and connections' },
  { value: 'deploy', label: 'Deploy', description: 'Deploy and take down workflows' },
] as const

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

  const activeKeys = keys?.filter((k) => !k.revokedAt) ?? []

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
    <section className="rounded-md border border-border p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
          API Keys
        </h2>
        <Button size="sm" className="h-7 gap-1.5 text-xs" onClick={() => setCreateOpen(true)}>
          <Plus className="h-3 w-3" />
          Create Key
        </Button>
      </div>

      <p className="mt-1 text-[10px] text-muted-foreground/60">Keys are scoped to a project.</p>

      {isLoading ? (
        <div className="mt-3 space-y-1.5">
          <ApiKeySkeleton />
          <ApiKeySkeleton />
        </div>
      ) : activeKeys.length === 0 ? (
        <div className="mt-3 rounded-md border border-dashed border-border py-6 text-center">
          <p className="text-xs text-muted-foreground">No API keys yet</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground/60">
            Create a key for programmatic access
          </p>
        </div>
      ) : (
        <div className="mt-3 space-y-1.5">
          {activeKeys.map((key) => {
            const scopes: string[] = JSON.parse(key.scopes)
            return (
              <div
                key={key.id}
                className="flex items-center justify-between rounded-md border border-border px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium">{key.name}</span>
                    <code className="rounded bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {key.keyPrefix}...
                    </code>
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    {scopes.map((s) => (
                      <span
                        key={s}
                        className="rounded bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                      >
                        {s}
                      </span>
                    ))}
                    <span className="text-[10px] text-muted-foreground/60">·</span>
                    <span className="text-[10px] text-muted-foreground/60">
                      {key.lastUsedAt ? `Used ${timeAgo(key.lastUsedAt)}` : 'Never used'}
                    </span>
                    {key.expiresAt && (
                      <>
                        <span className="text-[10px] text-muted-foreground/60">·</span>
                        <span
                          className={`text-[10px] ${new Date(key.expiresAt) < new Date() ? 'text-status-error' : 'text-muted-foreground/60'}`}
                        >
                          {new Date(key.expiresAt) < new Date()
                            ? 'Expired'
                            : `Expires in ${timeUntil(key.expiresAt)}`}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setRevokeTarget(key.id)}
                >
                  Revoke
                </Button>
              </div>
            )
          })}
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

/* ── Create Key Dialog ── */

function CreateKeyDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (key: ApiKeyCreated) => void
}) {
  const { projects, activeProjectId } = useOrgStore(
    useShallow((s) => ({ projects: s.projects, activeProjectId: s.activeProjectId })),
  )
  const [name, setName] = useState('')
  const [selectedProjectId, setSelectedProjectId] = useState(activeProjectId ?? '')
  const [scopes, setScopes] = useState<Set<string>>(new Set(['read']))
  const [expiresAt, setExpiresAt] = useState<Date | null>(null)

  useEffect(() => {
    if (open) setSelectedProjectId(activeProjectId ?? projects[0]?.id ?? '')
  }, [open, activeProjectId, projects])

  function handleCreated(key: ApiKeyCreated) {
    onCreated(key)
    setName('')
    setScopes(new Set(['read']))
    setExpiresAt(null)
  }

  const createMutation = useMutation({
    mutationFn: () =>
      api.createApiKey({
        name: name.trim(),
        projectId: selectedProjectId,
        scopes: [...scopes],
        expiresAt: expiresAt?.toISOString() ?? null,
      }),
    onSuccess: handleCreated,
    onError: (err) => toast.error(err.message),
  })

  function toggleScope(scope: string) {
    setScopes((prev) => {
      const next = new Set(prev)
      if (next.has(scope)) next.delete(scope)
      else next.add(scope)
      return next
    })
  }

  function handleCreate() {
    createMutation.mutate()
  }

  const canCreate = name.trim() && selectedProjectId && scopes.size > 0 && !createMutation.isPending
  const projectOptions = projects.map((p) => ({ value: p.id, label: p.name }))

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-md border border-border bg-card p-6 shadow-lg">
          <Dialog.Title className="text-base font-semibold">Create API Key</Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-muted-foreground">
            Give the key a name and select its permissions.
          </Dialog.Description>
          <div className="mt-4 space-y-4">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. CI/CD pipeline"
                className="w-full rounded-md border border-border bg-transparent px-3 py-1.5 text-sm outline-none focus:border-primary/50"
                autoFocus
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Project</label>
              <Select
                value={selectedProjectId}
                onValueChange={setSelectedProjectId}
                options={projectOptions}
                className="w-full h-8 text-xs"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs text-muted-foreground">Scopes</label>
              <div className="space-y-1.5">
                {SCOPES.map((scope) => (
                  <label
                    key={scope.value}
                    className="flex cursor-pointer items-center gap-2.5 rounded-md border border-border px-3 py-2 transition-colors hover:bg-muted/30"
                  >
                    <input
                      type="checkbox"
                      checked={scopes.has(scope.value)}
                      onChange={() => toggleScope(scope.value)}
                      className="h-3.5 w-3.5 rounded border-border accent-primary"
                    />
                    <div>
                      <span className="text-sm font-medium">{scope.label}</span>
                      <p className="text-[10px] text-muted-foreground">{scope.description}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">
                Expiration (optional)
              </label>
              <DateTimePicker
                value={expiresAt}
                onChange={setExpiresAt}
                minDate={new Date()}
                placeholder="No expiration"
                className="h-8 text-xs"
              />
            </div>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <Dialog.Close asChild>
              <Button variant="ghost" size="sm">
                Cancel
              </Button>
            </Dialog.Close>
            <Button size="sm" disabled={!canCreate} onClick={handleCreate}>
              {createMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Create
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

/* ── Key Created Dialog ── */

function KeyCreatedDialog({
  apiKey,
  onClose,
}: {
  apiKey: ApiKeyCreated | null
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    if (!apiKey) return
    await navigator.clipboard.writeText(apiKey.key)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleOpenChange(open: boolean) {
    if (!open) onClose()
  }

  return (
    <Dialog.Root open={!!apiKey} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[480px] -translate-x-1/2 -translate-y-1/2 rounded-md border border-border bg-card p-6 shadow-lg">
          <Dialog.Title className="text-base font-semibold">API Key Created</Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-muted-foreground">
            Copy your key now — it won't be shown again.
          </Dialog.Description>
          {apiKey && (
            <div className="mt-4">
              <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2">
                <code className="flex-1 select-all break-all text-xs">{apiKey.key}</code>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 shrink-0 gap-1.5 text-xs"
                  onClick={handleCopy}
                >
                  {copied ? (
                    <>
                      <Check className="h-3 w-3" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" />
                      Copy
                    </>
                  )}
                </Button>
              </div>
              <p className="mt-2 text-[10px] text-amber-500">
                Store this key securely. You will not be able to see it again.
              </p>
            </div>
          )}
          <div className="mt-5 flex justify-end">
            <Dialog.Close asChild>
              <Button size="sm">Done</Button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
