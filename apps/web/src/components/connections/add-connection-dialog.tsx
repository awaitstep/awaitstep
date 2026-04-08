import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, ExternalLink } from 'lucide-react'
import * as Dialog from '@radix-ui/react-dialog'
import { Button } from '../ui/button'
import { Select } from '../ui/select'
import { api } from '../../lib/api-client'
import { getEnabledProviders, type ProviderDefinition } from '../../lib/provider-registry'

type DialogStep = 'provider' | 'token' | 'details'

export function AddConnectionDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const [step, setStep] = useState<DialogStep>('provider')
  const [provider, setProvider] = useState<ProviderDefinition | null>(null)

  function handleDialogOpenChange(v: boolean) {
    if (!v) onClose()
  }

  function handleBackToProvider() {
    setStep('provider')
    setProvider(null)
  }
  const [credentials, setCredentials] = useState<Record<string, string>>({})
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([])
  const [accountId, setAccountId] = useState('')
  const [name, setName] = useState('')
  const [verifyError, setVerifyError] = useState<string | null>(null)

  const verifyMutation = useMutation({
    mutationFn: () => api.verifyCredentials(provider!.id, credentials),
    onSuccess: (data) => {
      if (!data.valid) {
        setVerifyError(
          'Credentials are invalid or inactive. Check that you entered them correctly.',
        )
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
    mutationFn: () =>
      api.createConnection({
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
    <Dialog.Root open onOpenChange={handleDialogOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[480px] -translate-x-1/2 -translate-y-1/2 rounded-md border border-border bg-card p-6 shadow-lg">
          <Dialog.Title className="text-base font-semibold text-foreground">
            Add Connection
          </Dialog.Title>

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
                <Button variant="ghost" size="sm" onClick={onClose}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {step === 'token' && provider && (
            <div className="mt-4 space-y-4">
              <div className="rounded-md border border-border bg-muted/30 p-3">
                <p className="text-xs font-medium text-foreground/60">
                  Create an API token with these permissions:
                </p>
                <div className="mt-2 space-y-1">
                  {provider.permissions.map((perm) => (
                    <div key={perm.resource} className="flex items-center gap-2 text-xs">
                      <span className="w-16 shrink-0 text-muted-foreground/60">{perm.scope}</span>
                      <span className="flex-1 text-muted-foreground">{perm.resource}</span>
                      <span
                        className={
                          perm.level === 'Edit' ? 'text-status-warning' : 'text-muted-foreground/60'
                        }
                      >
                        {perm.level}
                      </span>
                    </div>
                  ))}
                </div>
                {provider.permissionsNote && (
                  <p className="mt-2 text-xs text-muted-foreground/60">
                    {provider.permissionsNote}
                  </p>
                )}
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

              {verifyError && <p className="text-xs text-status-error">{verifyError}</p>}

              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={handleBackToProvider}>
                  Back
                </Button>
                <Button
                  size="sm"
                  disabled={
                    provider.credentialFields.some((f) => !(credentials[f.key] ?? '').trim()) ||
                    verifyMutation.isPending
                  }
                  onClick={() => verifyMutation.mutate()}
                >
                  {verifyMutation.isPending && (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  )}
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
                <p className="text-xs text-status-error">
                  {createMutation.error instanceof Error
                    ? createMutation.error.message
                    : 'Failed to create connection'}
                </p>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <Button variant="ghost" size="sm" onClick={() => setStep('token')}>
                  Back
                </Button>
                <Button
                  size="sm"
                  disabled={
                    !name.trim() ||
                    (provider.verifyReturnsAccounts && !accountId) ||
                    createMutation.isPending
                  }
                  onClick={() => createMutation.mutate()}
                >
                  {createMutation.isPending && (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  )}
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
