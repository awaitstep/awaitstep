import { useState, useEffect, useRef } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  CheckCircle2,
  Loader2,
  ExternalLink,
  ArrowRight,
  XCircle,
  Workflow,
  Rocket,
  Zap,
} from 'lucide-react'
import { Button } from '../ui/button'
import { api } from '../../lib/api-client'
import { getEnabledProviders, type ProviderDefinition } from '../../lib/provider-registry'
import { useOnboardingStore } from '../../stores/onboarding-store'

type Step = 1 | 2 | 3 | 4

export function OnboardingWizard() {
  const [step, setStep] = useState<Step>(1)
  const [selectedProvider, setSelectedProvider] = useState<ProviderDefinition | null>(null)
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const skip = useOnboardingStore((s) => s.skip)

  const handleSkip = () => {
    skip()
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="w-full max-w-md">
        {/* Labeled stepper */}
        <div className="mb-6 flex items-center justify-center gap-3">
          {(['Welcome', 'Provider', 'Credentials', 'Ready'] as const).map((label, i) => {
            const stepNum = (i + 1) as Step
            const isActive = stepNum === step
            const isComplete = stepNum < step
            return (
              <div key={label} className="flex items-center gap-3">
                {i > 0 && (
                  <div
                    className={`h-px w-4 ${isComplete || isActive ? 'bg-foreground/40' : 'bg-muted-foreground/20'}`}
                  />
                )}
                <div className="flex items-center gap-1.5">
                  <div
                    className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-medium ${
                      isComplete
                        ? 'bg-primary text-primary-foreground'
                        : isActive
                          ? 'bg-foreground text-background'
                          : 'bg-muted-foreground/20 text-muted-foreground/60'
                    }`}
                  >
                    {isComplete ? <CheckCircle2 size={12} /> : stepNum}
                  </div>
                  <span
                    className={`text-xs font-medium ${isActive ? 'text-foreground' : 'text-muted-foreground/60'}`}
                  >
                    {label}
                  </span>
                </div>
              </div>
            )
          })}
        </div>

        <div className="rounded-md border border-border bg-card p-8">
          {step === 1 && <WelcomeStep onNext={() => setStep(2)} />}
          {step === 2 && (
            <SelectProviderStep
              onSelect={(provider) => {
                setSelectedProvider(provider)
                setStep(3)
              }}
            />
          )}
          {step === 3 && selectedProvider && (
            <ConfigureCredentialsStep
              provider={selectedProvider}
              onBack={() => setStep(2)}
              onComplete={() => {
                queryClient.invalidateQueries({ queryKey: ['connections'] })
                setStep(4)
              }}
            />
          )}
          {step === 4 && selectedProvider && (
            <ReadyStep
              provider={selectedProvider}
              onGoToDashboard={() => {
                queryClient.invalidateQueries({ queryKey: ['connections'] })
                queryClient.invalidateQueries({ queryKey: ['workflows'] })
              }}
              onStartFromScratch={() =>
                navigate({ to: '/workflows/$workflowId/canvas', params: { workflowId: 'new' } })
              }
              onUseTemplate={() =>
                navigate({
                  to: '/workflows/$workflowId/canvas',
                  params: { workflowId: 'new' },
                  search: { template: true },
                })
              }
            />
          )}
        </div>

        <div className="mt-4 text-center">
          <button
            onClick={handleSkip}
            className="text-xs text-muted-foreground/60 transition-colors hover:text-muted-foreground"
          >
            Skip for now
          </button>
        </div>
      </div>
    </div>
  )
}

function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <div className="text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
        <Workflow className="h-6 w-6 text-primary" />
      </div>
      <h2 className="mt-4 text-lg font-semibold text-foreground">Welcome to AwaitStep</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Build and deploy durable workflows in minutes.
      </p>

      <div className="mt-5 space-y-2.5 text-left">
        <div className="flex items-center gap-3 rounded-lg bg-muted/40 px-3 py-2.5">
          <Workflow size={16} className="shrink-0 text-primary" />
          <span className="text-sm text-foreground/80">Visual drag-and-drop workflow builder</span>
        </div>
        <div className="flex items-center gap-3 rounded-lg bg-muted/40 px-3 py-2.5">
          <Rocket size={16} className="shrink-0 text-primary" />
          <span className="text-sm text-foreground/80">One-click deploy to Cloudflare Workers</span>
        </div>
        <div className="flex items-center gap-3 rounded-lg bg-muted/40 px-3 py-2.5">
          <Zap size={16} className="shrink-0 text-primary" />
          <span className="text-sm text-foreground/80">Built-in durable execution and retries</span>
        </div>
      </div>

      <Button className="mt-6 w-full gap-2" onClick={onNext}>
        Get started
        <ArrowRight size={16} />
      </Button>
    </div>
  )
}

function SelectProviderStep({ onSelect }: { onSelect: (provider: ProviderDefinition) => void }) {
  const providers = getEnabledProviders()

  return (
    <div>
      <h2 className="text-lg font-semibold text-foreground">Select a Provider</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Choose where you'd like to deploy your workflows.
      </p>

      <div className="mt-4 space-y-2">
        {providers.map((provider) => (
          <button
            key={provider.id}
            onClick={() => onSelect(provider)}
            className="flex w-full items-center gap-3 rounded-md border border-border bg-muted/40 px-4 py-3 text-left transition-colors hover:border-primary/40 hover:bg-muted/60"
          >
            <provider.icon className="h-5 w-5 text-foreground/60" />
            <div>
              <span className="text-sm font-medium text-foreground">{provider.name}</span>
              <p className="text-xs text-muted-foreground">{provider.description}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

type VerifyState = 'idle' | 'verifying' | 'success' | 'error'

function ConfigureCredentialsStep({
  provider,
  onBack,
  onComplete,
}: {
  provider: ProviderDefinition
  onBack: () => void
  onComplete: () => void
}) {
  const [credentials, setCredentials] = useState<Record<string, string>>({})
  const [verifyState, setVerifyState] = useState<VerifyState>('idle')
  const [verifyError, setVerifyError] = useState('')
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([])
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  const verifyMutation = useMutation({
    mutationFn: () => api.verifyCredentials(provider.id, credentials),
    onSuccess: (data) => {
      if (!data.valid) {
        setVerifyState('error')
        setVerifyError('Credentials are invalid or inactive.')
        return
      }
      if (provider.verifyReturnsAccounts && data.accounts.length === 0) {
        setVerifyState('error')
        setVerifyError('Credentials are valid but have no account access.')
        return
      }
      setAccounts(data.accounts)
      setVerifyState('success')
    },
    onError: (err) => {
      setVerifyState('error')
      setVerifyError(err instanceof Error ? err.message : 'Verification failed')
    },
  })

  const createMutation = useMutation({
    mutationFn: () =>
      api.createConnection({
        name: accounts[0]?.name ?? provider.name,
        provider: provider.id,
        credentials: { ...credentials, ...(accounts[0] ? { accountId: accounts[0].id } : {}) },
      }),
    onSuccess: () => onComplete(),
  })

  // Auto-verify when all credential fields with minLength meet their threshold
  const autoVerifyField = provider.credentialFields.find((f) => f.minLength)
  useEffect(() => {
    if (!autoVerifyField) return
    const value = credentials[autoVerifyField.key] ?? ''
    if (value.length < (autoVerifyField.minLength ?? 0)) {
      setVerifyState('idle')
      return
    }
    setVerifyState('verifying')

    debounceRef.current = setTimeout(() => {
      verifyMutation.mutate()
    }, 500)
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [credentials[autoVerifyField?.key ?? '']])

  const updateCredential = (key: string, value: string) => {
    setCredentials((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-foreground">Connect {provider.name}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Create an API token with the following permissions:
      </p>

      <div className="mt-4 rounded-lg border border-border bg-muted/30 p-3">
        <ul className="space-y-1.5">
          {provider.permissions.map((perm) => (
            <li key={perm.resource} className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{perm.resource}</span>
              <span className="rounded bg-muted/60 px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                {perm.level}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {provider.tokenCreateUrl && (
        <a
          href={provider.tokenCreateUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80"
        >
          {provider.tokenCreateLabel ?? `Create token on ${provider.name}`}
          <ExternalLink size={12} />
        </a>
      )}

      <div className="mt-4 space-y-3">
        {provider.credentialFields.map((field) => (
          <div key={field.key}>
            <label className="block text-xs font-medium text-muted-foreground">{field.label}</label>
            <div className="relative mt-1">
              <input
                type={field.type}
                value={credentials[field.key] ?? ''}
                onChange={(e) => updateCredential(field.key, e.target.value)}
                placeholder={field.placeholder}
                className="w-full rounded-lg border border-border bg-muted/40 px-3 py-2 pr-8 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-border"
              />
              {field.minLength && (
                <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
                  {verifyState === 'verifying' && (
                    <Loader2 size={14} className="animate-spin text-muted-foreground/60" />
                  )}
                  {verifyState === 'success' && (
                    <CheckCircle2 size={14} className="text-status-success" />
                  )}
                  {verifyState === 'error' && <XCircle size={14} className="text-status-error" />}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {verifyState === 'error' && <p className="mt-1.5 text-xs text-status-error">{verifyError}</p>}
      {verifyState === 'success' && accounts[0] && (
        <p className="mt-1.5 text-xs text-status-success/80">
          Connected to {accounts[0].name} ({accounts[0].id})
        </p>
      )}

      <div className="mt-6 flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onBack}>
          Back
        </Button>
        <Button
          size="sm"
          disabled={verifyState !== 'success' || createMutation.isPending}
          onClick={() => createMutation.mutate()}
        >
          {createMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : 'Connect'}
        </Button>
      </div>
    </div>
  )
}

function ReadyStep({
  provider,
  onGoToDashboard,
  onStartFromScratch,
  onUseTemplate,
}: {
  provider: ProviderDefinition
  onGoToDashboard: () => void
  onStartFromScratch: () => void
  onUseTemplate: () => void
}) {
  return (
    <div className="text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-md bg-status-success/10">
        <CheckCircle2 className="h-6 w-6 text-status-success" />
      </div>
      <h2 className="mt-4 text-base font-semibold text-foreground">You're all set!</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Your account is connected and ready to go.
      </p>

      <div className="mt-6 space-y-2">
        <div className="flex items-center gap-3 rounded-lg bg-muted/40 p-3">
          <CheckCircle2 size={16} className="shrink-0 text-status-success" />
          <span className="text-sm text-foreground/70">Signed in</span>
        </div>
        <div className="flex items-center gap-3 rounded-lg bg-muted/40 p-3">
          <CheckCircle2 size={16} className="shrink-0 text-status-success" />
          <span className="text-sm text-foreground/70">{provider.name} connected</span>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3">
        <Button className="w-full" onClick={onStartFromScratch}>
          Start from scratch
        </Button>
        <Button className="w-full" variant="outline" onClick={onUseTemplate}>
          Use a template
        </Button>
      </div>

      <button
        onClick={onGoToDashboard}
        className="mt-4 text-xs text-muted-foreground/60 transition-colors hover:text-muted-foreground"
      >
        Go to Dashboard
      </button>
    </div>
  )
}
