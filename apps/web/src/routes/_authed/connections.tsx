import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Plus, Trash2, Loader2, ExternalLink, Server, CheckCircle2, Pencil } from 'lucide-react'
import * as Dialog from '@radix-ui/react-dialog'
import { Button } from '../../components/ui/button'
import { Select } from '../../components/ui/select'
import { ConfirmDialog } from '../../components/ui/confirm-dialog'
import { api } from '../../lib/api-client'
import { getEnabledProviders, getProvider, type ProviderDefinition } from '../../lib/provider-registry'

export const Route = createFileRoute('/_authed/connections')({
  component: ConnectionsPage,
})

function ConnectionsPage() {
  const queryClient = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<{ id: string; name: string; accountId: string } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)

  const { data: connections, isLoading } = useQuery({
    queryKey: ['connections'],
    queryFn: () => api.listConnections(),
    retry: false,
  })

  const { data: selfHosted } = useQuery({
    queryKey: ['self-hosted-connection'],
    queryFn: () => api.getSelfHostedConnection(),
    retry: false,
  })

  const registerMutation = useMutation({
    mutationFn: () => api.registerSelfHostedConnection(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connections'] })
      queryClient.invalidateQueries({ queryKey: ['self-hosted-connection'] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteConnection(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connections'] })
    },
  })

  return (
    <div>
      <div className="flex items-center justify-between border-b border-border pb-4">
        <h1 className="text-lg font-semibold">Connections</h1>
        <Button size="sm" className="gap-1.5" onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4" />
          Add Connection
        </Button>
      </div>

      <div className="mx-auto max-w-screen-md">
      {/* Self-hosted banner */}
      {selfHosted?.configured && !selfHosted.registered && (
        <div className="mt-6 rounded-md border border-primary/20 bg-primary/[0.04] p-4">
          <div className="flex items-start gap-3">
            <Server className="mt-0.5 h-5 w-5 text-primary" />
            <div className="flex-1">
              <p className="text-sm font-medium">Self-hosted connection detected</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Your server has a Cloudflare connection configured via environment variables ({selfHosted.name} &middot; {selfHosted.accountId}).
              </p>
              <Button
                size="sm"
                className="mt-3 gap-1.5"
                disabled={registerMutation.isPending}
                onClick={() => registerMutation.mutate()}
              >
                {registerMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                )}
                Register Connection
              </Button>
            </div>
          </div>
        </div>
      )}

      {selfHosted?.configured && selfHosted.registered && (
        <div className="mt-6 flex items-center gap-2 rounded-lg border border-status-success/20 bg-status-success/[0.04] px-4 py-2.5">
          <CheckCircle2 className="h-4 w-4 text-status-success" />
          <span className="text-xs text-status-success/80">Self-hosted connection active ({selfHosted.name})</span>
        </div>
      )}

      {/* Self-hosting instructions */}
      <div className="mt-6 rounded-md border border-border bg-muted/30 p-4">
        <div className="flex items-center gap-2">
          <Server className="h-4 w-4 text-muted-foreground" />
          <p className="text-xs font-medium text-muted-foreground">Self-hosting?</p>
        </div>
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground/60">
          Add these variables to your <code className="rounded bg-muted/60 px-1 py-0.5 text-muted-foreground">.env</code> file
          to auto-register a connection for all users:
        </p>
        <pre className="mt-2 overflow-x-auto rounded-lg border border-border bg-muted/50 p-3 text-[11px] leading-relaxed text-muted-foreground">
{`CF_API_TOKEN=your-cloudflare-api-token
CF_ACCOUNT_ID=your-cloudflare-account-id
CF_CONNECTION_NAME=Production  # optional`}
        </pre>
      </div>

      {isLoading && (
        <div className="mt-8 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {connections && connections.length === 0 && (
        <div className="mt-6 rounded-md border border-border px-4 py-8 text-center text-sm text-muted-foreground">
          No connections yet.{' '}
          <button onClick={() => setDialogOpen(true)} className="text-primary hover:underline">
            Add one
          </button>{' '}
          to deploy workflows.
        </div>
      )}

      {connections && connections.length > 0 && (
        <div className="mt-6 overflow-hidden border border-border">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/60">Name</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/60">Provider</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/60">Account ID</th>
                <th className="w-12 px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {connections.map((conn) => (
                <tr key={conn.id} className="border-b border-border/50 last:border-0 transition-colors hover:bg-muted/30">
                  <td className="px-4 py-3 text-sm font-medium text-foreground">{conn.name}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{getProvider(conn.provider)?.name ?? conn.provider}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{conn.credentials.accountId}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        onClick={() => setEditTarget({ id: conn.id, name: conn.name, accountId: conn.credentials.accountId })}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-red-400"
                        onClick={() => setDeleteTarget({ id: conn.id, name: conn.name })}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      </div>

      <AddConnectionDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />

      <EditConnectionDialog
        connection={editTarget}
        onClose={() => setEditTarget(null)}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}
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
    </div>
  )
}

type DialogStep = 'provider' | 'token' | 'details'

function AddConnectionDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [step, setStep] = useState<DialogStep>('provider')
  const [provider, setProvider] = useState<ProviderDefinition | null>(null)
  const [credentials, setCredentials] = useState<Record<string, string>>({})
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([])
  const [accountId, setAccountId] = useState('')
  const [name, setName] = useState('')
  const [verifyError, setVerifyError] = useState<string | null>(null)

  const verifyMutation = useMutation({
    mutationFn: () => api.verifyCredentials(provider!.id, credentials),
    onSuccess: (data) => {
      if (!data.valid) {
        setVerifyError('Credentials are invalid or inactive. Check that you entered them correctly.')
        return
      }
      if (provider?.verifyReturnsAccounts && data.accounts.length === 0) {
        setVerifyError('Credentials are valid but have no account access. Check permissions.')
        return
      }
      setAccounts(data.accounts)
      setAccountId(data.accounts[0]?.id ?? '')
      setVerifyError(null)
      setStep('details')
    },
    onError: (err) => {
      setVerifyError(err instanceof Error ? err.message : 'Failed to verify credentials')
    },
  })

  const createMutation = useMutation({
    mutationFn: () => api.createConnection({
      name,
      provider: provider!.id,
      credentials: { ...credentials, ...(accountId ? { accountId } : {}) },
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connections'] })
      onClose()
    },
  })

  const handleProviderSelect = (p: ProviderDefinition) => {
    setProvider(p)
    setStep('token')
  }

  const updateCredential = (key: string, value: string) => {
    setCredentials((prev) => ({ ...prev, [key]: value }))
    setVerifyError(null)
  }

  const enabledProviders = getEnabledProviders()

  return (
    <Dialog.Root open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[480px] -translate-x-1/2 -translate-y-1/2 rounded-md border border-border bg-card p-6 shadow-lg">
          <Dialog.Title className="text-base font-semibold text-foreground">Add Connection</Dialog.Title>

        {step === 'provider' && (
          <div className="mt-4">
            <p className="text-xs text-muted-foreground">Select a provider</p>
            <div className="mt-3 space-y-2">
              {enabledProviders.map((p) => (
                <button
                  key={p.id}
                  onClick={() => handleProviderSelect(p)}
                  className="flex w-full items-center gap-3 rounded-md border border-border bg-muted/40 px-4 py-3 text-left transition-colors hover:border-primary/40 hover:bg-muted/60"
                >
                  <p.icon className="h-5 w-5 text-foreground/60" />
                  <div>
                    <span className="text-sm font-medium text-foreground">{p.name}</span>
                    <p className="text-xs text-muted-foreground">{p.description}</p>
                  </div>
                </button>
              ))}
            </div>
            <div className="mt-5 flex justify-end">
              <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
            </div>
          </div>
        )}

        {step === 'token' && provider && (
          <div className="mt-4 space-y-4">
            <div className="rounded-md border border-border bg-muted/30 p-3">
              <p className="text-xs font-medium text-foreground/60">Create an API token with these permissions:</p>
              <div className="mt-2 space-y-1">
                {provider.permissions.map((perm) => (
                  <div key={perm.resource} className="flex items-center gap-2 text-xs">
                    <span className="w-16 shrink-0 text-muted-foreground/60">{perm.scope}</span>
                    <span className="flex-1 text-muted-foreground">{perm.resource}</span>
                    <span className={perm.level === 'Edit' ? 'text-amber-400/70' : 'text-muted-foreground/60'}>{perm.level}</span>
                  </div>
                ))}
              </div>
              {provider.tokenCreateUrl && (
                <a
                  href={provider.tokenCreateUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  {provider.tokenCreateLabel ?? `Open ${provider.name} API Tokens`}
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>

            {provider.credentialFields.map((field) => (
              <div key={field.key}>
                <label className="mb-1 block text-xs text-muted-foreground">{field.label}</label>
                <input
                  type={field.type}
                  value={credentials[field.key] ?? ''}
                  onChange={(e) => updateCredential(field.key, e.target.value)}
                  placeholder={field.placeholder}
                  className="w-full rounded-md border border-border bg-muted/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
                />
              </div>
            ))}

            {verifyError && (
              <p className="text-xs text-red-400">{verifyError}</p>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => { setStep('provider'); setProvider(null) }}>Back</Button>
              <Button
                size="sm"
                disabled={provider.credentialFields.some((f) => !(credentials[f.key] ?? '').trim()) || verifyMutation.isPending}
                onClick={() => verifyMutation.mutate()}
              >
                {verifyMutation.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                Verify &amp; Continue
              </Button>
            </div>
          </div>
        )}

        {step === 'details' && provider && (
          <div className="mt-4 space-y-3">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Connection Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Production"
                className="w-full rounded-md border border-border bg-muted/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
              />
            </div>

            {accounts.length > 1 ? (
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Account</label>
                <Select
                  value={accountId}
                  onValueChange={setAccountId}
                  options={accounts.map((a) => ({ value: a.id, label: a.name }))}
                  className="w-full"
                />
              </div>
            ) : accounts.length === 1 ? (
              <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2">
                <provider.icon className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-foreground/60">{accounts[0].name}</span>
                <span className="text-xs text-muted-foreground/60">{accounts[0].id}</span>
              </div>
            ) : null}

            {createMutation.isError && (
              <p className="text-xs text-red-400">
                {createMutation.error instanceof Error ? createMutation.error.message : 'Failed to create connection'}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" size="sm" onClick={() => setStep('token')}>Back</Button>
              <Button
                size="sm"
                disabled={!name.trim() || (provider.verifyReturnsAccounts && !accountId) || createMutation.isPending}
                onClick={() => createMutation.mutate()}
              >
                {createMutation.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                Connect
              </Button>
            </div>
          </div>
        )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function EditConnectionDialog({
  connection,
  onClose,
}: {
  connection: { id: string; name: string; accountId: string } | null
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [apiToken, setApiToken] = useState('')
  const [error, setError] = useState<string | null>(null)


  const updateMutation = useMutation({
    mutationFn: async () => {
      const data: { name?: string; credentials?: Record<string, string> } = {}
      if (name !== connection?.name) data.name = name
      if (apiToken.trim()) data.credentials = { accountId: connection?.accountId ?? '', apiToken }
      return api.updateConnection(connection!.id, data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connections'] })
      onClose()
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Failed to update connection')
    },
  })

  // Keep name in sync when opening with a new connection
  if (connection && name === '' && connection.name) {
    setName(connection.name)
  }

  return (
    <Dialog.Root open={!!connection} onOpenChange={(open) => { if (!open) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[480px] -translate-x-1/2 -translate-y-1/2 rounded-md border border-border bg-card p-6 shadow-lg">
          <Dialog.Title className="text-base font-semibold text-foreground">Edit Connection</Dialog.Title>

          <div className="mt-4 space-y-4">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Connection Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-md border border-border bg-muted/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Account ID</label>
              <input
                type="text"
                value={connection?.accountId ?? ''}
                disabled
                className="w-full rounded-md border border-border bg-muted/30 px-3 py-2 font-mono text-sm text-muted-foreground/60"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs text-muted-foreground">API Token</label>
              <input
                type="password"
                value={apiToken}
                onChange={(e) => { setApiToken(e.target.value); setError(null) }}
                placeholder="Leave blank to keep current token"
                className="w-full rounded-md border border-border bg-muted/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/50"
              />
            </div>

            {error && <p className="text-xs text-red-400">{error}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
              <Button
                size="sm"
                disabled={!name.trim() || (name === connection?.name && !apiToken.trim()) || updateMutation.isPending}
                onClick={() => updateMutation.mutate()}
              >
                {updateMutation.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                Save
              </Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
