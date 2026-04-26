import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import {
  Rocket,
  CheckCircle2,
  XCircle,
  Loader2,
  Cable,
  Settings,
  ExternalLink,
  ChevronRight,
  Check,
} from 'lucide-react'
import { Button } from '../ui/button'
import { EmptyState } from '../ui/empty-state'
import { api } from '../../lib/api-client'
import { useOrgReady } from '../../stores/org-store'
import { useConnectionsStore } from '../../stores/connections-store'
import { useDeployStream, type DeployProgress } from '../../hooks/use-deploy-stream'
import { DeploymentConfigForm } from './deployment-config-form'
import { cn } from '../../lib/utils'

const FALLBACK_UI_SCHEMA = {
  groups: [{ title: 'Configuration', fields: [] }],
}

const STEPS = [
  { key: 'connection', label: 'Connection', icon: Cable },
  { key: 'configure', label: 'Configure', icon: Settings },
  { key: 'deploy', label: 'Review', icon: Rocket },
] as const

type StepKey = (typeof STEPS)[number]['key']

interface DeployPageProps {
  workflowId: string
  versionId?: string
  kind?: 'workflow' | 'script'
}

export function DeployPage({ workflowId, versionId, kind }: DeployPageProps) {
  const ready = useOrgReady()
  const connections = useConnectionsStore((s) => s.connections)
  const [step, setStep] = useState<StepKey>('connection')
  const [connectionId, setConnectionId] = useState('')
  const [localConfig, setLocalConfig] = useState<Record<string, unknown> | null>(null)

  const { state, progress, error, result, startDeploy, retry } = useDeployStream({
    workflowId,
    versionId,
  })

  const { data: deployConfigData, isLoading: configLoading } = useQuery({
    queryKey: ['deploy-config', workflowId, connectionId],
    queryFn: () => api.getDeployConfig(workflowId, connectionId),
    enabled: ready && !!connectionId,
  })

  const config = localConfig ?? deployConfigData?.config ?? {}
  const selectedConnection = connections?.find((c) => c.id === connectionId)
  const hasConnections = connections && connections.length > 0

  function handleConnectionSelect(id: string) {
    setConnectionId(id)
    setLocalConfig(null)
    setStep('configure')
  }

  const { data: previewData } = useQuery({
    queryKey: ['deploy-config-preview', workflowId, connectionId, config],
    queryFn: () => api.getDeployConfigPreview(workflowId, connectionId, config),
    enabled: ready && !!connectionId && step === 'deploy',
  })

  function handleNext() {
    if (step === 'configure') setStep('deploy')
  }

  function handleBack() {
    if (step === 'configure') setStep('connection')
    else if (step === 'deploy') setStep('configure')
  }

  function handleDeploy() {
    if (connectionId) {
      startDeploy(connectionId, config)
    }
  }

  if (state === 'deploying') return <StatusView type="deploying" progress={progress} />
  if (state === 'success') {
    return (
      <StatusView
        type="success"
        result={result}
        onRetry={retry}
        workflowId={workflowId}
        kind={kind}
      />
    )
  }
  if (state === 'error') {
    return <StatusView type="error" error={error} onRetry={retry} workflowId={workflowId} />
  }

  // Connections still loading from store
  if (!connections) {
    return <DeployPageSkeleton />
  }

  if (!hasConnections) {
    return (
      <EmptyState
        icon={Cable}
        title="No connections"
        description="Add a Cloudflare connection to deploy your workflow."
        action={
          <Link to="/connections" search={{ new: true }}>
            <Button variant="outline" size="sm">
              Add Connection
            </Button>
          </Link>
        }
      />
    )
  }

  const stepIndex = STEPS.findIndex((s) => s.key === step)

  return (
    <div className="w-full">
      {/* Step indicator */}
      <nav className="mb-8 flex items-center">
        {STEPS.map((s, i) => {
          const isActive = i === stepIndex
          const isCompleted = i < stepIndex
          const Icon = s.icon
          return (
            <div key={s.key} className="flex items-center">
              {i > 0 && (
                <div
                  className={cn('h-px w-12 sm:w-20', isCompleted ? 'bg-primary' : 'bg-border')}
                />
              )}
              <button
                type="button"
                onClick={() => isCompleted && setStep(s.key)}
                disabled={!isCompleted && !isActive}
                className={cn(
                  'flex items-center gap-2 rounded-md px-4 py-2 text-xs font-medium transition-colors',
                  isActive && 'bg-primary text-primary-foreground',
                  isCompleted && 'cursor-pointer bg-primary/10 text-primary hover:bg-primary/20',
                  !isActive && !isCompleted && 'bg-muted text-muted-foreground',
                )}
              >
                {isCompleted ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
                <span className="hidden sm:inline">{s.label}</span>
              </button>
            </div>
          )
        })}
      </nav>

      {/* Step: Connection */}
      {step === 'connection' && (
        <div>
          <h2 className="text-base font-medium">Select a connection</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Choose which provider account to deploy this workflow to.
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {connections!.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => handleConnectionSelect(c.id)}
                className={cn(
                  'group flex items-start gap-3 rounded-lg border p-4 text-left transition-colors',
                  c.id === connectionId
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/40 hover:bg-muted/30',
                )}
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted/60">
                  <Cable className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{c.name}</span>
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                      {c.provider === 'cloudflare' ? 'Cloudflare' : c.provider}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground/60">
                    {c.credentials.accountId ?? 'No account ID'}
                  </p>
                </div>
                <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground/40 transition-colors group-hover:text-foreground" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step: Configure */}
      {step === 'configure' && (
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-medium">Configure deployment</h2>
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              {selectedConnection?.name}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            These settings are optional. Skip this step to deploy with defaults.
          </p>
          <div className="mt-8">
            {configLoading ? (
              <ConfigFormSkeleton />
            ) : deployConfigData ? (
              <DeploymentConfigForm
                uiSchema={deployConfigData.uiSchema ?? FALLBACK_UI_SCHEMA}
                config={config}
                onChange={setLocalConfig}
              />
            ) : null}
          </div>
          <div className="mt-10 border-t border-border pt-6 flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={handleBack}>
              Back
            </Button>
            <Button size="sm" disabled={configLoading} onClick={handleNext} className="gap-1.5">
              Next
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* Step: Review & Deploy */}
      {step === 'deploy' && (
        <div>
          <h2 className="text-base font-medium">Review and deploy</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Review the generated platform configuration before deploying.
          </p>

          {/* Connection summary */}
          <div className="mt-6 flex items-center gap-3 rounded-lg border border-border px-4 py-3">
            <Cable className="h-4 w-4 text-muted-foreground" />
            <div>
              <span className="text-sm font-medium">{selectedConnection?.name}</span>
              <span className="ml-2 font-mono text-xs text-muted-foreground">
                {selectedConnection?.credentials.accountId}
              </span>
            </div>
          </div>

          {/* Config preview */}
          <div className="mt-4">
            <div className="flex items-center justify-between rounded-t-lg border border-b-0 border-border bg-muted/30 px-4 py-2">
              <span className="text-xs font-medium text-muted-foreground">
                {previewData?.filename ?? 'config.json'}
              </span>
              <button
                type="button"
                onClick={() => {
                  if (previewData) {
                    navigator.clipboard.writeText(JSON.stringify(previewData.content, null, 2))
                  }
                }}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Copy
              </button>
            </div>
            {previewData ? (
              <pre className="max-h-[400px] overflow-auto rounded-b-lg border border-border bg-muted/10 p-4 font-mono text-xs leading-relaxed text-foreground">
                {JSON.stringify(previewData.content, null, 2)}
              </pre>
            ) : (
              <PreviewSkeleton />
            )}
          </div>

          <div className="mt-8 border-t border-border pt-6 flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={handleBack}>
              Back
            </Button>
            <Button size="sm" disabled={!previewData} onClick={handleDeploy} className="gap-1.5">
              <Rocket className="h-3.5 w-3.5" />
              Deploy
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// --- Skeletons ---

function Bone({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-muted/40 ${className ?? ''}`} />
}

function DeployPageSkeleton() {
  return (
    <div className="w-full">
      {/* Step indicator skeleton */}
      <div className="mb-8 flex items-center gap-0">
        <Bone className="h-9 w-32 rounded-md" />
        <Bone className="mx-2 h-px w-16" />
        <Bone className="h-9 w-32 rounded-md bg-muted/25" />
        <Bone className="mx-2 h-px w-16" />
        <Bone className="h-9 w-32 rounded-md bg-muted/25" />
      </div>
      {/* Connection cards skeleton */}
      <Bone className="h-5 w-48 mb-2" />
      <Bone className="h-3 w-72 bg-muted/25 mb-5" />
      <div className="grid gap-3 sm:grid-cols-2">
        <Bone className="h-20 w-full rounded-lg" />
        <Bone className="h-20 w-full rounded-lg bg-muted/25" />
      </div>
    </div>
  )
}

function ConfigFormSkeleton() {
  return (
    <div className="animate-pulse space-y-8">
      {[1, 2, 3].map((group) => (
        <div key={group} className="space-y-4">
          <div>
            <Bone className="h-4 w-28" />
            <Bone className="mt-1 h-3 w-56 bg-muted/25" />
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Bone className="h-3.5 w-40" />
                <Bone className="h-2.5 w-64 bg-muted/20" />
              </div>
              <Bone className="h-5 w-9 rounded-full" />
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Bone className="h-3.5 w-36" />
                <Bone className="h-2.5 w-48 bg-muted/20" />
              </div>
              <Bone className="h-5 w-9 rounded-full" />
            </div>
          </div>
          {group < 3 && <Bone className="h-px w-full bg-border/40" />}
        </div>
      ))}
    </div>
  )
}

function PreviewSkeleton() {
  return (
    <div className="animate-pulse rounded-b-lg border border-border bg-muted/10 p-4 space-y-2">
      <Bone className="h-3 w-48" />
      <Bone className="h-3 w-36 bg-muted/25" />
      <Bone className="h-3 w-56" />
      <Bone className="h-3 w-32 bg-muted/25" />
      <Bone className="h-3 w-44" />
      <Bone className="h-3 w-40 bg-muted/25" />
      <Bone className="h-3 w-52" />
      <Bone className="h-3 w-28 bg-muted/25" />
    </div>
  )
}

// --- Deploy stage timeline ---

const DEPLOY_STAGES = [
  { key: 'INITIALIZING', label: 'Initializing' },
  { key: 'GENERATING_CODE', label: 'Compiling code' },
  { key: 'CODE_READY', label: 'Code ready' },
  { key: 'DETECTING_BINDINGS', label: 'Detecting bindings' },
  { key: 'BINDINGS_READY', label: 'Bindings configured' },
  { key: 'CREATING_WORKER', label: 'Creating worker' },
  { key: 'DEPLOYING', label: 'Deploying to Cloudflare' },
  { key: 'WORKER_DEPLOYED', label: 'Worker deployed' },
  { key: 'UPDATING_WORKFLOW', label: 'Updating workflow' },
  { key: 'COMPLETED', label: 'Completed' },
]

function DeployStagesView({ progress }: { progress: DeployProgress | null }) {
  const currentIndex = progress ? DEPLOY_STAGES.findIndex((s) => s.key === progress.stage) : -1

  return (
    <div className="w-full max-w-sm">
      <p className="mb-6 text-sm font-medium">{progress?.message ?? 'Deploying...'}</p>
      <div className="space-y-2.5">
        {DEPLOY_STAGES.map((stage, i) => {
          const isActive = i === currentIndex
          const isPast = i < currentIndex
          return (
            <div
              key={stage.key}
              className={cn(
                'flex items-center gap-2.5 text-sm',
                isActive && 'text-foreground font-medium',
                isPast && 'text-muted-foreground',
                !isActive && !isPast && 'text-muted-foreground/30',
              )}
            >
              {isActive ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
              ) : isPast ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-status-success" />
              ) : (
                <div className="h-4 w-4 shrink-0 rounded-full border border-current opacity-40" />
              )}
              {stage.label}
            </div>
          )
        })}
      </div>
      {progress && (
        <div className="mt-6">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${progress.progress}%` }}
            />
          </div>
          <p className="mt-1.5 text-right text-xs text-muted-foreground">{progress.progress}%</p>
        </div>
      )}
    </div>
  )
}

// --- Status views (deploying / success / error) ---

type StatusViewProps =
  | { type: 'deploying'; progress: DeployProgress | null }
  | {
      type: 'success'
      result: { url?: string; dashboardUrl?: string; deploymentId?: string } | null
      onRetry: () => void
      workflowId: string
      kind?: 'workflow' | 'script'
    }
  | { type: 'error'; error: string | null; onRetry: () => void; workflowId: string }

function StatusView(props: StatusViewProps) {
  return (
    <div className="py-10">
      {props.type === 'deploying' && (
        <div className="max-w-md">
          <DeployStagesView progress={props.progress} />
        </div>
      )}

      {props.type === 'success' && (
        <div className="flex flex-col items-center text-center py-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-status-success/10">
            <CheckCircle2 className="h-6 w-6 text-status-success" />
          </div>
          <p className="mt-4 text-sm font-medium">Deployed successfully</p>
          {props.kind === 'script' && props.result?.url && (
            <p className="mt-2 max-w-md text-xs text-muted-foreground">
              Invoke this function via HTTP <code className="rounded bg-muted px-1">POST</code> to
              the URL below. The response body is the function&rsquo;s return value.
            </p>
          )}
          {props.result?.url && (
            <a
              href={props.result.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 flex items-center gap-1.5 text-sm text-primary hover:underline"
            >
              {props.result.url}
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
          {props.result?.dashboardUrl && (
            <a
              href={props.result.dashboardUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground hover:underline"
            >
              View in Cloudflare Dashboard
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
          <div className="mt-6 flex items-center gap-3">
            <Link to="/workflows/$workflowId" params={{ workflowId: props.workflowId }}>
              <Button variant="outline" size="sm">
                Back to workflow
              </Button>
            </Link>
            <Button size="sm" onClick={props.onRetry}>
              Deploy again
            </Button>
          </div>
        </div>
      )}

      {props.type === 'error' && (
        <div className="flex flex-col items-center text-center py-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-status-error/10">
            <XCircle className="h-6 w-6 text-status-error" />
          </div>
          <p className="mt-4 text-sm font-medium">Deployment failed</p>
          {props.error && (
            <p className="mt-2 max-w-sm text-xs leading-relaxed text-muted-foreground">
              {props.error}
            </p>
          )}
          <div className="mt-6 flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={props.onRetry}>
              Back to review
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
