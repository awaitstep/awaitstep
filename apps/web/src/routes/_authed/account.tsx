import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Loader2, Github, Download, Trash2, Monitor, Plus, Copy, Check } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { ConfirmDialog } from '../../components/ui/confirm-dialog'
import { DateTimePicker } from '../../components/ui/datetime-picker'
import { useAuthStore } from '../../stores/auth-store'
import { authClient, handleSignOut } from '../../lib/auth-client'
import { api } from '../../lib/api-client'
import { timeAgo, timeUntil, formatMonthYear } from '../../lib/time'
import type { ApiKeyCreated } from '../../lib/api-client'
import { toast } from 'sonner'

export const Route = createFileRoute('/_authed/account')({
  component: AccountPage,
})

function AccountPage() {
  const user = useAuthStore((s) => s.user)
  const session = useAuthStore((s) => s.session)

  if (!user || !session) {
    return (
      <div className="mt-12 flex justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/60" />
      </div>
    )
  }

  return (
    <div>
      <h1 className="border-b border-border pb-4 text-lg font-semibold">Account</h1>
      <div className="mt-6">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-4">
            <ProfileSection user={user} />
            <ConnectedAccountsSection />
            <SessionsSection currentSessionToken={session.token} />
            <DataPrivacySection />
          </div>
          <div className="space-y-4">
            <ApiKeysSection />
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Profile ── */

function ProfileSection({ user }: { user: { name: string; email: string; createdAt: Date } }) {
  const [name, setName] = useState(user.name)
  const setSession = useAuthStore((s) => s.setSession)

  const updateMutation = useMutation({
    mutationFn: async () => {
      const res = await authClient.updateUser({ name })
      if (res.error) throw new Error(res.error.message)
      return res
    },
    onSuccess: async () => {
      const session = await authClient.getSession()
      if (session.data) setSession(session.data)
    },
  })

  const memberSince = formatMonthYear(user.createdAt)

  return (
    <section className="rounded-md border border-border p-4">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">Profile</h2>

      <div className="mt-3 space-y-3">
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Full name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-border bg-transparent px-3 py-1.5 text-sm outline-none focus:border-primary/50"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Email</label>
          <input
            type="email"
            value={user.email}
            disabled
            className="w-full rounded-md border border-border bg-transparent px-3 py-1.5 text-sm text-muted-foreground"
          />
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <p className="text-[10px] text-muted-foreground/60">Member since {memberSince}</p>
        <Button
          size="sm"
          disabled={name === user.name || !name.trim() || updateMutation.isPending}
          onClick={() => updateMutation.mutate()}
        >
          {updateMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Update
        </Button>
      </div>
    </section>
  )
}

/* ── Connected Accounts ── */

const PROVIDERS = [
  {
    id: 'google',
    name: 'Google',
    icon: () => (
      <svg className="h-4 w-4" viewBox="0 0 24 24">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
      </svg>
    ),
  },
  {
    id: 'github',
    name: 'GitHub',
    icon: () => <Github className="h-4 w-4" />,
  },
]

function ConnectedAccountsSection() {
  const appURL = import.meta.env.VITE_APP_URL ?? 'http://localhost:3000'

  const { data: accounts, isLoading } = useQuery({
    queryKey: ['linked-accounts'],
    queryFn: async () => {
      const res = await authClient.listAccounts()
      if (res.error) throw new Error(res.error.message)
      return res.data ?? []
    },
  })

  const linkMutation = useMutation({
    mutationFn: async (provider: string) => {
      await authClient.linkSocial({ provider: provider as 'google' | 'github', callbackURL: `${appURL}/account` })
    },
  })

  const queryClient = useQueryClient()
  const unlinkMutation = useMutation({
    mutationFn: async (providerId: string) => {
      const res = await authClient.unlinkAccount({ providerId })
      if (res.error) throw new Error(res.error.message)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['linked-accounts'] })
    },
  })

  const linkedProviders = new Set(accounts?.map((a) => a.providerId) ?? [])

  return (
    <section className="rounded-md border border-border p-4">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">Connected Accounts</h2>

      {isLoading ? (
        <div className="mt-3 flex justify-center py-3">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground/60" />
        </div>
      ) : (
        <div className="mt-3 space-y-1.5">
          {PROVIDERS.map((provider) => {
            const isLinked = linkedProviders.has(provider.id)
            const account = accounts?.find((a) => a.providerId === provider.id)
            const Icon = provider.icon
            return (
              <div
                key={provider.id}
                className="flex items-center justify-between rounded-md border border-border px-3 py-2"
              >
                <div className="flex items-center gap-2.5">
                  <Icon />
                  <span className="text-sm">{provider.name}</span>
                  {isLinked && (
                    <span className="rounded bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">Connected</span>
                  )}
                </div>
                {isLinked ? (
                  <Button variant="outline" size="sm" className="h-7 text-xs" disabled={unlinkMutation.isPending} onClick={() => account && unlinkMutation.mutate(account.providerId)}>
                    Disconnect
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" className="h-7 text-xs" disabled={linkMutation.isPending} onClick={() => linkMutation.mutate(provider.id)}>
                    Connect
                  </Button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

/* ── Sessions ── */

function SessionsSection({ currentSessionToken }: { currentSessionToken: string }) {
  const [revokeTarget, setRevokeTarget] = useState<string | null>(null)

  const { data: sessions, isLoading } = useQuery({
    queryKey: ['sessions'],
    queryFn: async () => {
      const res = await authClient.listSessions()
      if (res.error) throw new Error(res.error.message)
      return res.data ?? []
    },
  })

  const queryClient = useQueryClient()
  const revokeMutation = useMutation({
    mutationFn: async (token: string) => {
      const res = await authClient.revokeSession({ token })
      if (res.error) throw new Error(res.error.message)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] })
    },
  })

  return (
    <section className="rounded-md border border-border p-4">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">Sessions</h2>

      {isLoading ? (
        <div className="mt-3 flex justify-center py-3">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground/60" />
        </div>
      ) : (
        <div className="mt-3 space-y-1.5">
          {sessions?.map((s) => {
            const isCurrent = s.token === currentSessionToken
            const sessionAge = timeAgo(s.createdAt)
            return (
              <div
                key={s.token}
                className="flex items-center justify-between rounded-md border border-border px-3 py-2"
              >
                <div className="flex items-center gap-2.5">
                  <Monitor className="h-3.5 w-3.5 text-muted-foreground/60" />
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium">{parseUserAgent(s.userAgent ?? '')}</span>
                      {isCurrent && (
                        <span className="rounded bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">Current</span>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground">{s.ipAddress ?? 'Unknown IP'} · {sessionAge}</p>
                  </div>
                </div>
                {!isCurrent && (
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setRevokeTarget(s.token)}>
                    Revoke
                  </Button>
                )}
              </div>
            )
          })}
        </div>
      )}

      <ConfirmDialog
        open={!!revokeTarget}
        onOpenChange={(open) => { if (!open) setRevokeTarget(null) }}
        title="Revoke session"
        description="This will sign out the device associated with this session."
        confirmLabel="Revoke"
        variant="destructive"
        loading={revokeMutation.isPending}
        onConfirm={() => {
          if (revokeTarget) {
            revokeMutation.mutate(revokeTarget, { onSettled: () => setRevokeTarget(null) })
          }
        }}
      />
    </section>
  )
}

/* ── API Keys ── */

const SCOPES = [
  { value: 'read', label: 'Read', description: 'View workflows, runs, and connections' },
  { value: 'write', label: 'Write', description: 'Create and modify workflows and connections' },
  { value: 'deploy', label: 'Deploy', description: 'Deploy and take down workflows' },
] as const

function ApiKeysSection() {
  const [createOpen, setCreateOpen] = useState(false)
  const [revokeTarget, setRevokeTarget] = useState<string | null>(null)
  const [createdKey, setCreatedKey] = useState<ApiKeyCreated | null>(null)

  const queryClient = useQueryClient()

  const { data: keys, isLoading } = useQuery({
    queryKey: ['api-keys'],
    queryFn: () => api.listApiKeys(),
  })

  const revokeMutation = useMutation({
    mutationFn: (id: string) => api.revokeApiKey(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] })
      toast.success('API key revoked')
    },
    onError: (err) => toast.error(err.message),
  })

  const activeKeys = keys?.filter((k) => !k.revokedAt) ?? []

  return (
    <section className="rounded-md border border-border p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">API Keys</h2>
        <Button size="sm" className="h-7 gap-1.5 text-xs" onClick={() => setCreateOpen(true)}>
          <Plus className="h-3 w-3" />
          Create Key
        </Button>
      </div>

      {isLoading ? (
        <div className="mt-3 flex justify-center py-3">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground/60" />
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
                        <span className={`text-[10px] ${new Date(key.expiresAt) < new Date() ? 'text-status-error' : 'text-muted-foreground/60'}`}>
                          {new Date(key.expiresAt) < new Date() ? 'Expired' : `Expires in ${timeUntil(key.expiresAt)}`}
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
        </div>
      )}

      <CreateKeyDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(key) => {
          setCreateOpen(false)
          setCreatedKey(key)
          queryClient.invalidateQueries({ queryKey: ['api-keys'] })
        }}
      />

      <KeyCreatedDialog
        apiKey={createdKey}
        onClose={() => setCreatedKey(null)}
      />

      <ConfirmDialog
        open={!!revokeTarget}
        onOpenChange={(open) => { if (!open) setRevokeTarget(null) }}
        title="Revoke API key"
        description="This key will immediately stop working. Any applications using it will lose access."
        confirmLabel="Revoke"
        variant="destructive"
        loading={revokeMutation.isPending}
        onConfirm={() => {
          if (revokeTarget) {
            revokeMutation.mutate(revokeTarget, { onSettled: () => setRevokeTarget(null) })
          }
        }}
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
  const [name, setName] = useState('')
  const [scopes, setScopes] = useState<Set<string>>(new Set(['read']))
  const [expiresAt, setExpiresAt] = useState<Date | null>(null)

  const createMutation = useMutation({
    mutationFn: () => api.createApiKey({ name: name.trim(), scopes: [...scopes], expiresAt: expiresAt?.toISOString() ?? null }),
    onSuccess: (key) => {
      onCreated(key)
      setName('')
      setScopes(new Set(['read']))
      setExpiresAt(null)
    },
    onError: (err) => toast.error(err.message),
  })

  const toggleScope = (scope: string) => {
    setScopes((prev) => {
      const next = new Set(prev)
      if (next.has(scope)) next.delete(scope)
      else next.add(scope)
      return next
    })
  }

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
              <label className="mb-1 block text-xs text-muted-foreground">Expiration (optional)</label>
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
              <Button variant="ghost" size="sm">Cancel</Button>
            </Dialog.Close>
            <Button
              size="sm"
              disabled={!name.trim() || scopes.size === 0 || createMutation.isPending}
              onClick={() => createMutation.mutate()}
            >
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

  const handleCopy = async () => {
    if (!apiKey) return
    await navigator.clipboard.writeText(apiKey.key)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Dialog.Root open={!!apiKey} onOpenChange={(open) => { if (!open) onClose() }}>
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

/* ── Data & Privacy ── */

function DataPrivacySection() {
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [exporting, setExporting] = useState(false)

  const handleExport = async () => {
    setExporting(true)
    try {
      const [workflows, connections, runs] = await Promise.all([
        api.listWorkflows(),
        api.listConnections(),
        api.listAllRuns(),
      ])
      const data = { workflows, connections, runs, exportedAt: new Date().toISOString() }
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `awaitstep-export-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setExporting(false)
    }
  }

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await authClient.deleteUser()
      if (res.error) throw new Error(res.error.message)
    },
    onSuccess: () => {
      handleSignOut()
    },
  })

  return (
    <section className="rounded-md border border-border p-4">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">Data & Privacy</h2>

      <div className="mt-3 flex items-center justify-between">
        <div>
          <p className="text-xs font-medium">Export your data</p>
          <p className="text-[10px] text-muted-foreground">Download account data as JSON</p>
        </div>
        <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" disabled={exporting} onClick={handleExport}>
          {exporting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
          Export
        </Button>
      </div>

      <div className="my-3 h-px bg-border" />

      <div className="rounded-md border border-red-500/20 bg-red-500/5 px-3 py-2.5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-status-error">Danger Zone</p>
            <p className="text-[10px] text-muted-foreground">Permanently delete your account</p>
          </div>
          <Button
            variant="destructive"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="h-3 w-3" />
            Delete
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete account"
        description="This will permanently delete your account, all workflows, connections, and deployment history. This cannot be undone."
        confirmLabel="Delete my account"
        variant="destructive"
        loading={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate()}
      />
    </section>
  )
}

/* ── Helpers ── */

function parseUserAgent(ua: string): string {
  if (!ua) return 'Unknown browser'
  const browser = /Chrome/.test(ua) ? 'Chrome' : /Firefox/.test(ua) ? 'Firefox' : /Safari/.test(ua) ? 'Safari' : /Edge/.test(ua) ? 'Edge' : 'Browser'
  const os = /Mac/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : 'Unknown'
  return `${browser} on ${os}`
}

