import { createFileRoute, Link, useParams } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, useCallback } from 'react'
import {
  ArrowLeft, Loader2, Rocket, CheckCircle2, XCircle, ExternalLink,
  Play, Code2, Settings, Upload, Box, Zap, RefreshCw, Cloud, Plus, Clock,
} from 'lucide-react'
import { Button } from '../../../components/ui/button'
import { api, type ConnectionSummary } from '../../../lib/api-client'

export const Route = createFileRoute('/_authed/workflows/$workflowId/deployments')({
  component: DeploymentsPage,
})

interface DeployProgress {
  stage: string
  message: string
  progress: number
}

const PIPELINE_STEPS = [
  { key: 'INITIALIZING', label: 'Initialize', description: 'Preparing deployment environment', icon: Play },
  { key: 'GENERATING_CODE', label: 'Compile Code', description: 'Transpiling TypeScript to JavaScript', icon: Code2 },
  { key: 'CODE_READY', label: 'Code Ready', description: 'Compiled output verified', icon: CheckCircle2 },
  { key: 'DETECTING_BINDINGS', label: 'Detect Bindings', description: 'Analyzing workflow resource bindings', icon: Settings },
  { key: 'BINDINGS_READY', label: 'Bindings Configured', description: 'All bindings resolved', icon: CheckCircle2 },
  { key: 'CREATING_WORKER', label: 'Create Worker', description: 'Setting up Cloudflare Worker', icon: Box },
  { key: 'DEPLOYING', label: 'Deploy', description: 'Uploading to Cloudflare', icon: Upload },
  { key: 'WORKER_DEPLOYED', label: 'Worker Live', description: 'Worker is running on the edge', icon: CheckCircle2 },
  { key: 'UPDATING_WORKFLOW', label: 'Update Workflow', description: 'Registering workflow configuration', icon: RefreshCw },
  { key: 'COMPLETED', label: 'Completed', description: 'Deployment successful', icon: Zap },
]

type PageState = 'select-connection' | 'deploying' | 'success' | 'error' | 'history'

function DeploymentsPage() {
  const { workflowId } = useParams({ from: '/_authed/workflows/$workflowId/deployments' })
  const queryClient = useQueryClient()

  const { data: workflow } = useQuery({
    queryKey: ['workflow', workflowId],
    queryFn: () => api.getWorkflow(workflowId),
  })

  const { data: deployments, isLoading: deploymentsLoading } = useQuery({
    queryKey: ['deployments', workflowId],
    queryFn: () => api.listDeployments(workflowId),
  })

  const { data: connections } = useQuery({
    queryKey: ['connections'],
    queryFn: () => api.listConnections(),
  })

  const hasDeployments = deployments && deployments.length > 0
  const [pageState, setPageState] = useState<PageState>('select-connection')
  const [initialized, setInitialized] = useState(false)
  if (!initialized && deployments !== undefined) {
    if (hasDeployments) setPageState('history')
    setInitialized(true)
  }

  const [selectedConnection, setSelectedConnection] = useState<ConnectionSummary | null>(null)
  const [progress, setProgress] = useState<DeployProgress | null>(null)
  const [deployError, setDeployError] = useState<string | null>(null)
  const [deployResult, setDeployResult] = useState<{ deploymentId: string; url?: string } | null>(null)

  const startDeploy = useCallback(async (conn: ConnectionSummary) => {
    setSelectedConnection(conn)
    setPageState('deploying')
    setProgress(null)
    setDeployError(null)
    setDeployResult(null)

    try {
      const response = await fetch(`/api/workflows/${workflowId}/deploy-stream`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId: conn.id }),
      })

      if (!response.ok) {
        const body = await response.json().catch(() => null)
        throw new Error(body?.error ?? `Deploy failed: ${response.status}`)
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
                setDeployError(data.message)
                setPageState('error')
                return
              }
            }
            if (data.success !== undefined) {
              if (data.success) {
                setDeployResult({ deploymentId: data.deploymentId, url: data.url })
                setPageState('success')
                queryClient.invalidateQueries({ queryKey: ['workflow', workflowId] })
                queryClient.invalidateQueries({ queryKey: ['deployments', workflowId] })
              } else {
                setDeployError(data.error ?? 'Deploy failed')
                setPageState('error')
              }
              return
            }
          }
        }
      }
    } catch (err) {
      setDeployError(err instanceof Error ? err.message : 'Unknown error')
      setPageState('error')
    }
  }, [workflowId, queryClient])

  const connectionMap = new Map(connections?.map((c) => [c.id, c]) ?? [])

  return (
    <div className="fixed inset-0 flex flex-col bg-[oklch(0.11_0_0)]">
      {/* Header */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-white/[0.06] bg-[oklch(0.13_0_0)] px-5">
        <div className="flex items-center gap-3">
          <Link to="/workflows/$workflowId" params={{ workflowId }}>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-white/40 hover:text-white/80">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="h-5 w-px bg-white/[0.08]" />
          <div className="flex items-center gap-2">
            <Rocket className="h-4 w-4 text-white/40" />
            <span className="text-sm font-semibold text-white/90">Deployments</span>
            {workflow && (
              <>
                <span className="text-white/20">/</span>
                <span className="text-sm text-white/50">{workflow.name}</span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {pageState === 'history' && (
            <Button size="sm" className="gap-1.5" onClick={() => setPageState('select-connection')}>
              <Rocket className="h-3.5 w-3.5" />
              New Deployment
            </Button>
          )}
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-6 py-8">

          {/* Connection selection */}
          {pageState === 'select-connection' && (
            <div>
              <h2 className="text-lg font-semibold">Select a connection</h2>
              <p className="mt-1 text-sm text-muted-foreground">Choose which account to deploy to.</p>

              {connections && connections.length === 0 && (
                <div className="mt-6 rounded-xl border border-border bg-card p-8 text-center">
                  <Cloud className="mx-auto h-8 w-8 text-muted-foreground/30" />
                  <p className="mt-3 text-sm text-muted-foreground">No connections yet.</p>
                  <Link to="/connections" className="mt-3 inline-block">
                    <Button size="sm" className="gap-1.5">
                      <Plus className="h-4 w-4" />
                      Add Connection
                    </Button>
                  </Link>
                </div>
              )}

              {connections && connections.length > 0 && (
                <div className="mt-4 space-y-2">
                  {connections.map((conn) => (
                    <button
                      key={conn.id}
                      onClick={() => startDeploy(conn)}
                      className="group flex w-full items-center gap-4 rounded-xl border border-border bg-card p-4 text-left transition-all hover:border-primary/40 hover:bg-card/80"
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-orange-500/10">
                        <Cloud className="h-5 w-5 text-orange-400" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-semibold group-hover:text-primary">{conn.name}</h3>
                        <p className="text-xs text-muted-foreground">{conn.accountId}</p>
                      </div>
                      <Rocket className="h-4 w-4 text-white/15 group-hover:text-primary transition-colors" />
                    </button>
                  ))}
                </div>
              )}

              {hasDeployments && (
                <button
                  className="mt-4 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => setPageState('history')}
                >
                  Back to history
                </button>
              )}
            </div>
          )}

          {/* Deploying — vertical steps */}
          {pageState === 'deploying' && (
            <div>
              <div className="flex items-center gap-3 mb-8">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <div>
                  <h2 className="text-lg font-semibold">Deploying</h2>
                  {selectedConnection && (
                    <p className="text-xs text-muted-foreground">to {selectedConnection.name}</p>
                  )}
                </div>
              </div>
              <VerticalPipeline currentStage={progress?.stage ?? 'INITIALIZING'} status="deploying" />
            </div>
          )}

          {/* Success */}
          {pageState === 'success' && (
            <div>
              <div className="flex items-center gap-3 mb-8">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/10">
                  <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">Deployment Successful</h2>
                  <p className="text-xs text-muted-foreground">Your workflow is now live on Cloudflare</p>
                </div>
              </div>

              <VerticalPipeline currentStage="COMPLETED" status="success" />

              {deployResult && (
                <div className="mt-8 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-5">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-white/40">Worker</span>
                      <span className="font-mono text-sm text-white/80">{deployResult.deploymentId}</span>
                    </div>
                    {selectedConnection && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-white/40">Account</span>
                        <span className="text-sm text-white/60">{selectedConnection.name}</span>
                      </div>
                    )}
                    <div className="border-t border-white/[0.06] pt-3 flex items-center gap-4">
                      {deployResult.url && (
                        <a
                          href={deployResult.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          {deployResult.url.replace('https://', '')} <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                      {selectedConnection && (
                        <a
                          href={`https://dash.cloudflare.com/${selectedConnection.accountId}/workers/services/view/${deployResult.deploymentId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          CF Dashboard <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-6 flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setPageState('history')}>
                  View history
                </Button>
                <Link to="/workflows/$workflowId" params={{ workflowId }}>
                  <Button size="sm">Back to editor</Button>
                </Link>
              </div>
            </div>
          )}

          {/* Error */}
          {pageState === 'error' && (
            <div>
              <div className="flex items-center gap-3 mb-8">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/10">
                  <XCircle className="h-5 w-5 text-red-400" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">Deployment Failed</h2>
                  <p className="text-xs text-muted-foreground">Something went wrong during deployment</p>
                </div>
              </div>

              <VerticalPipeline currentStage={progress?.stage ?? 'DEPLOYING'} status="error" />

              {deployError && (
                <div className="mt-6 rounded-xl border border-red-500/20 bg-red-500/5 p-4">
                  <p className="text-sm text-red-300">{deployError}</p>
                </div>
              )}

              <div className="mt-6 flex gap-2">
                <Button size="sm" onClick={() => setPageState('select-connection')}>Try again</Button>
                <Button variant="ghost" size="sm" onClick={() => setPageState('history')}>View history</Button>
              </div>
            </div>
          )}

          {/* History */}
          {pageState === 'history' && (
            <div>
              {/* Latest deployment */}
              {deployments?.[0] && (
                <div className="rounded-xl border border-border bg-card p-5 mb-8">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="text-sm font-semibold">Latest Deployment</h3>
                    {deployments[0].status === 'success' ? (
                      <span className="flex items-center gap-1 text-xs text-emerald-400">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Live
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-red-400">
                        <XCircle className="h-3.5 w-3.5" /> Failed
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="font-mono">{deployments[0].workerName}</span>
                    <span>{new Date(deployments[0].createdAt).toLocaleString()}</span>
                    {(() => {
                      const conn = connectionMap.get(deployments[0].connectionId)
                      return conn ? <span>{conn.name}</span> : null
                    })()}
                  </div>
                  {deployments[0].status === 'success' && deployments[0].workerUrl && (
                    <a
                      href={deployments[0].workerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      {deployments[0].workerUrl.replace('https://', '')} <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              )}

              <h2 className="text-lg font-semibold">History</h2>

              {deploymentsLoading && (
                <div className="mt-4 flex justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              )}

              {deployments && deployments.length === 0 && (
                <div className="mt-4 rounded-xl border border-border bg-card p-8 text-center">
                  <Rocket className="mx-auto h-8 w-8 text-muted-foreground/30" />
                  <p className="mt-3 text-sm text-muted-foreground">No deployments yet.</p>
                </div>
              )}

              {deployments && deployments.length > 0 && (
                <div className="mt-4 space-y-px">
                  {deployments.map((d) => {
                    const conn = connectionMap.get(d.connectionId)
                    return (
                      <div
                        key={d.id}
                        className="flex items-center gap-4 px-4 py-3 first:rounded-t-lg last:rounded-b-lg border border-border bg-card -mt-px first:mt-0"
                      >
                        <div className="relative flex flex-col items-center">
                          {d.status === 'success' ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                          ) : (
                            <XCircle className="h-4 w-4 text-red-400" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm text-white/80">{d.workerName}</span>
                            {conn && (
                              <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-white/30">
                                {conn.name}
                              </span>
                            )}
                          </div>
                          {d.error && <p className="mt-0.5 text-xs text-red-400/60 truncate">{d.error}</p>}
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
                          <Clock className="h-3 w-3" />
                          {new Date(d.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}{' '}
                          {new Date(d.createdAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function VerticalPipeline({ currentStage, status }: { currentStage: string; status: 'deploying' | 'success' | 'error' }) {
  const currentIndex = PIPELINE_STEPS.findIndex((s) => s.key === currentStage)

  return (
    <div className="space-y-0">
      {PIPELINE_STEPS.map((step, i) => {
        const Icon = step.icon
        const isPast = i < currentIndex
        const isCurrent = i === currentIndex
        const isFailed = status === 'error' && isCurrent
        const isComplete = status === 'success' || isPast
        const isActive = status === 'deploying' && isCurrent
        const isLast = i === PIPELINE_STEPS.length - 1

        let dotColor = 'border-white/10 bg-transparent'
        let lineColor = 'bg-white/[0.06]'
        let textColor = 'text-white/25'
        let descColor = 'text-white/15'

        if (isFailed) {
          dotColor = 'border-red-500 bg-red-500/20'
          textColor = 'text-red-300'
          descColor = 'text-red-300/50'
        } else if (isActive) {
          dotColor = 'border-primary bg-primary/20'
          textColor = 'text-white/90'
          descColor = 'text-white/40'
        } else if (isComplete) {
          dotColor = 'border-emerald-500 bg-emerald-500/20'
          lineColor = 'bg-emerald-500/30'
          textColor = 'text-white/70'
          descColor = 'text-white/30'
        }

        return (
          <div key={step.key} className="flex gap-4">
            {/* Timeline */}
            <div className="flex w-8 flex-col items-center">
              <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 ${dotColor}`}>
                {isActive ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                ) : isComplete ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                ) : isFailed ? (
                  <XCircle className="h-3.5 w-3.5 text-red-400" />
                ) : (
                  <Icon className="h-3.5 w-3.5 text-white/15" />
                )}
              </div>
              {!isLast && (
                <div className={`w-0.5 flex-1 min-h-[24px] ${lineColor}`} />
              )}
            </div>

            {/* Content */}
            <div className={`pb-6 ${isLast ? 'pb-0' : ''}`}>
              <p className={`text-sm font-medium leading-8 ${textColor}`}>{step.label}</p>
              <p className={`text-xs ${descColor}`}>{step.description}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
