import { useState, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Loader2, CheckCircle2, XCircle, Rocket, ExternalLink, Clock, Copy, Check } from 'lucide-react'
import * as Dialog from '@radix-ui/react-dialog'
import { Button } from '../ui/button'
import { Select } from '../ui/select'
import { cn } from '../../lib/utils'
import { api } from '../../lib/api-client'
import { formatShortDate } from '../../lib/time'
import { usePollingStore } from '../../stores/polling-store'

export interface DeployProgress {
  stage: string
  message: string
  progress: number
}

interface DeployResult {
  success: boolean
  deploymentId: string
  url?: string
  dashboardUrl?: string
  error?: string
}

interface DeployDialogProps {
  open: boolean
  onClose: () => void
  workflowId: string
}

type DeployState = 'idle' | 'deploying' | 'success' | 'error'

const STAGES = [
  { key: 'INITIALIZING', label: 'Initializing' },
  { key: 'GENERATING_CODE', label: 'Compiling code' },
  { key: 'CODE_READY', label: 'Code ready' },
  { key: 'DETECTING_BINDINGS', label: 'Detecting bindings' },
  { key: 'BINDINGS_READY', label: 'Bindings configured' },
  { key: 'CREATING_WORKER', label: 'Creating worker' },
  { key: 'DEPLOYING', label: 'Deploying' },
  { key: 'WORKER_DEPLOYED', label: 'Worker deployed' },
  { key: 'UPDATING_WORKFLOW', label: 'Updating workflow' },
  { key: 'COMPLETED', label: 'Completed' },
]

export function DeployDialog({ open, onClose, workflowId }: DeployDialogProps) {
  const queryClient = useQueryClient()
  const [state, setState] = useState<DeployState>('idle')
  const [progress, setProgress] = useState<DeployProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [connectionId, setConnectionId] = useState('')
  const [deployResult, setDeployResult] = useState<DeployResult | null>(null)
  const [curlCopied, setCurlCopied] = useState(false)

  const { data: connections } = useQuery({
    queryKey: ['connections'],
    queryFn: () => api.listConnections(),
    enabled: open,
    retry: false,
  })

  const { data: deployments } = useQuery({
    queryKey: ['deployments', workflowId],
    queryFn: () => api.listDeployments(workflowId),
    enabled: open,
    retry: false,
  })

  const startDeploy = useCallback(async () => {
    if (!connectionId) return
    setState('deploying')
    setError(null)
    setProgress(null)
    setDeployResult(null)

    try {
      const response = await fetch(`/api/workflows/${workflowId}/deploy-stream`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId }),
      })

      if (!response.ok) {
        const body = await response.json().catch(() => null)
        throw new Error(body?.error ?? `Deploy request failed: ${response.status}`)
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response body')

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = JSON.parse(line.slice(6))

            if (data.stage) {
              setProgress(data)
              if (data.stage === 'FAILED') {
                setError(data.message)
                setState('error')
                return
              }
              if (data.stage === 'COMPLETED') {
                setProgress(data)
              }
            }

            if (data.success !== undefined) {
              setDeployResult(data)
              if (data.success) {
                setState('success')
                queryClient.invalidateQueries({ queryKey: ['workflow', workflowId] })
                queryClient.invalidateQueries({ queryKey: ['deployments', workflowId] })
                queryClient.invalidateQueries({ queryKey: ['all-deployments'] })
                usePollingStore.getState().start('all-deployments')
                setTimeout(() => usePollingStore.getState().stop('all-deployments'), 30_000)
              } else {
                setError(data.error ?? 'Deploy failed')
                setState('error')
              }
              return
            }
          }
        }
      }

      // Stream ended without result event — treat last progress as outcome
      if (state !== 'success' && state !== 'error') {
        setState('success')
        queryClient.invalidateQueries({ queryKey: ['workflow', workflowId] })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setState('error')
    }
  }, [connectionId, workflowId, state, queryClient])

  const selectedConnection = connections?.find((c) => c.id === connectionId)

  return (
    <Dialog.Root open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-md border border-border bg-card p-6 shadow-lg">
          <Dialog.Title className="flex items-center gap-2 text-base font-semibold text-foreground">
            <Rocket className="h-5 w-5" />
            Deploy Workflow
          </Dialog.Title>

        {state === 'idle' && (
          <div className="mt-4 space-y-4">
            {connections && connections.length > 0 ? (
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Connection</label>
                <Select
                  value={connectionId}
                  onValueChange={setConnectionId}
                  options={connections.map((c) => ({ value: c.id, label: `${c.name} (${c.credentials.accountId ?? ''})` }))}
                  className="w-full"
                />
              </div>
            ) : (
              <div className="rounded-lg border border-border bg-muted/30 p-3 text-center">
                <p className="text-xs text-muted-foreground">
                  No connections found.{' '}
                  <Link to="/connections" className="text-primary hover:underline" onClick={onClose}>
                    Add one
                  </Link>{' '}
                  to deploy.
                </p>
              </div>
            )}
            {deployments && deployments.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  <span>Recent deployments</span>
                </div>
                <div className="mt-2 max-h-32 space-y-1 overflow-y-auto">
                  {deployments.slice(0, 5).map((d) => (
                    <div key={d.id} className="flex items-center justify-between rounded-md bg-muted/40 px-2.5 py-1.5">
                      <div className="flex items-center gap-2">
                        {d.status === 'success' ? (
                          <CheckCircle2 className="h-3 w-3 text-status-success" />
                        ) : (
                          <XCircle className="h-3 w-3 text-status-error" />
                        )}
                        <span className="font-mono text-[11px] text-muted-foreground">{d.serviceName}</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground/60">
                        {formatShortDate(d.createdAt)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
              <Button size="sm" disabled={!connectionId} onClick={startDeploy}>
                Deploy
              </Button>
            </div>
          </div>
        )}

        {state === 'deploying' && (
          <div className="mt-4 space-y-3">
            {STAGES.map((stage) => {
              const isActive = progress?.stage === stage.key
              const isPast = progress && STAGES.findIndex((s) => s.key === progress.stage) > STAGES.findIndex((s) => s.key === stage.key)
              return (
                <div
                  key={stage.key}
                  className={cn(
                    'flex items-center gap-2 text-sm',
                    isActive ? 'text-foreground' : isPast ? 'text-muted-foreground' : 'text-muted-foreground/40',
                  )}
                >
                  {isActive ? (
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  ) : isPast ? (
                    <CheckCircle2 className="h-4 w-4 text-status-success" />
                  ) : (
                    <div className="h-4 w-4 rounded-full border border-border" />
                  )}
                  {stage.label}
                </div>
              )
            })}
            {progress && (
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted/60">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-300"
                  style={{ width: `${progress.progress}%` }}
                />
              </div>
            )}
          </div>
        )}

        {state === 'success' && (
          <div className="mt-4 space-y-4">
            <div className="flex items-center gap-2 text-status-success">
              <CheckCircle2 className="h-5 w-5" />
              <span className="text-sm font-medium">Deployed successfully</span>
            </div>

            {deployResult && (
              <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Worker</span>
                  <span className="font-mono text-xs text-foreground/70">{deployResult.deploymentId}</span>
                </div>
                {selectedConnection && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Connection</span>
                    <span className="text-xs text-foreground/70">{selectedConnection.name}</span>
                  </div>
                )}
                {deployResult.dashboardUrl && (
                  <a
                    href={deployResult.dashboardUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    View in Dashboard
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            )}

            {deployResult?.url && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Trigger</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(`curl -X POST ${deployResult.url}`)
                      setCurlCopied(true)
                      setTimeout(() => setCurlCopied(false), 2000)
                    }}
                    className="flex items-center gap-1 text-[10px] text-muted-foreground/60 hover:text-muted-foreground"
                  >
                    {curlCopied ? <Check className="h-3 w-3 text-status-success" /> : <Copy className="h-3 w-3" />}
                    {curlCopied ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <pre className="overflow-x-auto rounded-lg border border-border bg-muted/30 p-2 text-[11px] text-muted-foreground">
                  {`curl -X POST ${deployResult.url}`}
                </pre>
              </div>
            )}

            <div className="flex justify-end">
              <Button size="sm" onClick={onClose}>Close</Button>
            </div>
          </div>
        )}

        {state === 'error' && (
          <div className="mt-4 space-y-3">
            <div className="flex items-center gap-2 text-status-error">
              <XCircle className="h-5 w-5" />
              <span className="text-sm font-medium">Deployment failed</span>
            </div>
            {error && (
              <p className="rounded bg-red-500/10 p-2 text-xs text-red-300">{error}</p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
              <Button size="sm" onClick={() => { setState('idle'); setError(null) }}>Retry</Button>
            </div>
          </div>
        )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
