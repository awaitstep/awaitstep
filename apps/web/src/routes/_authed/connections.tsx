import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Plus, Trash2, Loader2, Cable, Cloud, ExternalLink, Server, CheckCircle2 } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { Select } from '../../components/ui/select'
import { ConfirmDialog } from '../../components/ui/confirm-dialog'
import { api } from '../../lib/api-client'

export const Route = createFileRoute('/_authed/connections')({
  component: ConnectionsPage,
})

const PROVIDERS = [
  { id: 'cloudflare', name: 'Cloudflare', icon: Cloud },
] as const

type ProviderId = (typeof PROVIDERS)[number]['id']

function ConnectionsPage() {
  const queryClient = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Connections</h1>
        <Button size="sm" className="gap-1.5" onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4" />
          Add Connection
        </Button>
      </div>

      {/* Self-hosted banner */}
      {selfHosted?.configured && !selfHosted.registered && (
        <div className="mt-6 rounded-xl border border-primary/20 bg-primary/[0.04] p-4">
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
        <div className="mt-6 flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.04] px-4 py-2.5">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          <span className="text-xs text-emerald-300/80">Self-hosted connection active ({selfHosted.name})</span>
        </div>
      )}

      {/* Self-hosting instructions */}
      <div className="mt-6 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
        <div className="flex items-center gap-2">
          <Server className="h-4 w-4 text-white/40" />
          <p className="text-xs font-medium text-white/50">Self-hosting?</p>
        </div>
        <p className="mt-1.5 text-xs leading-relaxed text-white/30">
          Add these variables to your <code className="rounded bg-white/[0.06] px-1 py-0.5 text-white/50">.env</code> file
          to auto-register a connection for all users:
        </p>
        <pre className="mt-2 overflow-x-auto rounded-lg bg-black/30 p-3 text-[11px] leading-relaxed text-white/40">
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
        <div className="mt-8 rounded-xl border border-border bg-card p-12 text-center">
          <Cable className="mx-auto h-8 w-8 text-muted-foreground/50" />
          <p className="mt-3 text-muted-foreground">
            No connections yet. Add one to deploy workflows.
          </p>
          <Button size="sm" className="mt-4 gap-1.5" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4" />
            Add Connection
          </Button>
        </div>
      )}

      {connections && connections.length > 0 && (
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {connections.map((conn) => (
            <div
              key={conn.id}
              className="rounded-xl border border-border bg-card p-4"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-500/10">
                    <Cloud className="h-4 w-4 text-orange-400" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold">{conn.name}</h3>
                    <p className="text-xs text-muted-foreground">Cloudflare</p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-red-400"
                  onClick={() => setDeleteTarget({ id: conn.id, name: conn.name })}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              <p className="mt-2 truncate text-xs text-muted-foreground">{conn.credentials.accountId}</p>
            </div>
          ))}
        </div>
      )}

      {dialogOpen && (
        <AddConnectionDialog onClose={() => setDialogOpen(false)} />
      )}

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

const CF_PERMISSIONS = [
  { scope: 'Account', resource: 'Workers Scripts', level: 'Edit' },
  { scope: 'Account', resource: 'Workers KV Storage', level: 'Edit' },
  { scope: 'Account', resource: 'Workers R2 Storage', level: 'Read' },
  { scope: 'Account', resource: 'D1', level: 'Edit' },
]

const CF_TOKEN_URL = 'https://dash.cloudflare.com/profile/api-tokens'

function AddConnectionDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const [step, setStep] = useState<DialogStep>('provider')
  const [provider, setProvider] = useState<ProviderId | null>(null)
  const [apiToken, setApiToken] = useState('')
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([])
  const [accountId, setAccountId] = useState('')
  const [name, setName] = useState('')
  const [verifyError, setVerifyError] = useState<string | null>(null)

  const verifyMutation = useMutation({
    mutationFn: () => api.verifyToken(apiToken),
    onSuccess: (data) => {
      if (!data.valid) {
        setVerifyError('Token is invalid or inactive. Check that you pasted it correctly.')
        return
      }
      if (data.accounts.length === 0) {
        setVerifyError('Token is valid but has no account access. Check token permissions.')
        return
      }
      setAccounts(data.accounts)
      setAccountId(data.accounts[0].id)
      setVerifyError(null)
      setStep('details')
    },
    onError: (err) => {
      setVerifyError(err instanceof Error ? err.message : 'Failed to verify token')
    },
  })

  const createMutation = useMutation({
    mutationFn: () => api.createConnection({ name, provider: provider!, credentials: { accountId, apiToken } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connections'] })
      onClose()
    },
  })

  const handleProviderSelect = (id: ProviderId) => {
    setProvider(id)
    setStep('token')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-[480px] rounded-xl border border-white/[0.08] bg-[oklch(0.14_0_0)] p-6 shadow-2xl">
        <h2 className="text-base font-semibold text-white/90">Add Connection</h2>

        {step === 'provider' && (
          <div className="mt-4">
            <p className="text-xs text-white/40">Select a provider</p>
            <div className="mt-3 space-y-2">
              {PROVIDERS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => handleProviderSelect(p.id)}
                  className="flex w-full items-center gap-3 rounded-lg border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-left transition-colors hover:border-primary/40 hover:bg-white/[0.06]"
                >
                  <p.icon className="h-5 w-5 text-white/60" />
                  <span className="text-sm font-medium text-white/80">{p.name}</span>
                </button>
              ))}
            </div>
            <div className="mt-5 flex justify-end">
              <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
            </div>
          </div>
        )}

        {step === 'token' && provider === 'cloudflare' && (
          <div className="mt-4 space-y-4">
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
              <p className="text-xs font-medium text-white/60">Create an API token with these permissions:</p>
              <div className="mt-2 space-y-1">
                {CF_PERMISSIONS.map((perm) => (
                  <div key={perm.resource} className="flex items-center gap-2 text-xs">
                    <span className="w-16 shrink-0 text-white/30">{perm.scope}</span>
                    <span className="flex-1 text-white/50">{perm.resource}</span>
                    <span className={perm.level === 'Edit' ? 'text-amber-400/70' : 'text-white/30'}>{perm.level}</span>
                  </div>
                ))}
              </div>
              <a
                href={CF_TOKEN_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                Open Cloudflare API Tokens
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>

            <div>
              <label className="mb-1 block text-xs text-white/50">API Token</label>
              <input
                type="password"
                value={apiToken}
                onChange={(e) => { setApiToken(e.target.value); setVerifyError(null) }}
                placeholder="Paste your API token"
                className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-white/90 outline-none focus:border-primary/50"
              />
            </div>

            {verifyError && (
              <p className="text-xs text-red-400">{verifyError}</p>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => { setStep('provider'); setProvider(null) }}>Back</Button>
              <Button
                size="sm"
                disabled={!apiToken.trim() || verifyMutation.isPending}
                onClick={() => verifyMutation.mutate()}
              >
                {verifyMutation.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                Verify &amp; Continue
              </Button>
            </div>
          </div>
        )}

        {step === 'details' && (
          <div className="mt-4 space-y-3">
            <div>
              <label className="mb-1 block text-xs text-white/50">Connection Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Production"
                className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-white/90 outline-none focus:border-primary/50"
              />
            </div>

            {accounts.length > 1 ? (
              <div>
                <label className="mb-1 block text-xs text-white/50">Account</label>
                <Select
                  value={accountId}
                  onValueChange={setAccountId}
                  options={accounts.map((a) => ({ value: a.id, label: a.name }))}
                  className="w-full"
                />
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                <Cloud className="h-4 w-4 text-white/40" />
                <span className="text-sm text-white/60">{accounts[0]?.name}</span>
                <span className="text-xs text-white/30">{accounts[0]?.id}</span>
              </div>
            )}

            {createMutation.isError && (
              <p className="text-xs text-red-400">
                {createMutation.error instanceof Error ? createMutation.error.message : 'Failed to create connection'}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" size="sm" onClick={() => setStep('token')}>Back</Button>
              <Button
                size="sm"
                disabled={!name.trim() || !accountId || createMutation.isPending}
                onClick={() => createMutation.mutate()}
              >
                {createMutation.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                Connect
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
