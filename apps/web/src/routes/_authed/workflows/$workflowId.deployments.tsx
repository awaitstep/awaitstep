import { createFileRoute, useParams } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import {
  Loader2, Rocket, CheckCircle2, XCircle, ExternalLink, X,
} from 'lucide-react'
import { Button } from '../../../components/ui/button'
import { DeployDialog } from '../../../components/canvas/deploy-dialog'
import { api } from '../../../lib/api-client'
import { useOrgReady } from '../../../stores/org-store'
import { useConnectionsStore } from '../../../stores/connections-store'
import { timeAgo, formatDate } from '../../../lib/time'

export const Route = createFileRoute('/_authed/workflows/$workflowId/deployments')({
  component: DeploymentsPage,
})

type Deployment = {
  id: string
  workflowId: string
  versionId: string
  connectionId: string | null
  serviceName: string
  serviceUrl: string | null
  status: string
  error: string | null
  createdAt: string
}

function DeploymentsPage() {
  const { workflowId } = useParams({ from: '/_authed/workflows/$workflowId/deployments' })
  const ready = useOrgReady()
  const [deployOpen, setDeployOpen] = useState(false)
  const [selectedDeployment, setSelectedDeployment] = useState<Deployment | null>(null)

  const { data: deployments, isLoading } = useQuery({
    queryKey: ['deployments', workflowId],
    queryFn: () => api.listDeployments(workflowId),
    enabled: ready,
  })

  const connections = useConnectionsStore((s) => s.connections)

  const { data: versions } = useQuery({
    queryKey: ['versions', workflowId],
    queryFn: () => api.listVersions(workflowId),
    enabled: ready,
  })

  const connectionMap = new Map(connections.map((c) => [c.id, c]))
  const versionMap = new Map(versions?.map((v) => [v.id, v]) ?? [])

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button size="sm" className="gap-1.5" onClick={() => setDeployOpen(true)}>
          <Rocket className="h-3.5 w-3.5" />
          New Deployment
        </Button>
      </div>

      {isLoading && (
        <div className="mt-8 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/60" />
        </div>
      )}

      {deployments && deployments.length === 0 && (
        <div className="rounded-md border border-border px-4 py-8 text-center text-sm text-muted-foreground">
          No deployments yet.{' '}
          <button onClick={() => setDeployOpen(true)} className="text-primary hover:underline">
            Deploy your workflow
          </button>{' '}
          to see history here.
        </div>
      )}

      {deployments && deployments.length > 0 && (
        <div className="space-y-2">
          {deployments.map((d, i) => {
            const conn = d.connectionId ? connectionMap.get(d.connectionId) : undefined
            return (
              <button
                key={d.id}
                onClick={() => setSelectedDeployment(d)}
                className="w-full rounded-lg border border-border bg-card px-4 py-3 text-left transition-colors hover:border-border/80 hover:bg-muted/20"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {d.status === 'success' ? (
                      <span className="flex items-center gap-1.5 text-xs text-status-success">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {i === 0 ? 'Latest' : 'Success'}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-xs text-status-error">
                        <XCircle className="h-3.5 w-3.5" />
                        Failed
                      </span>
                    )}
                    <span className="font-mono text-xs text-foreground/70">{d.serviceName}</span>
                    {conn && (
                      <span className="text-xs text-muted-foreground/50">{conn.name}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {d.serviceUrl && (
                      <span className="text-xs text-primary">
                        {d.serviceUrl.replace(/^https?:\/\//, '')}
                      </span>
                    )}
                    {d.error && !d.serviceUrl && (
                      <span className="text-xs text-status-error/60 truncate max-w-[200px]">{d.error}</span>
                    )}
                    <span className="text-xs text-muted-foreground">{timeAgo(d.createdAt)}</span>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {deployOpen && <DeployDialog onClose={() => setDeployOpen(false)} workflowId={workflowId} />}

      <DeploymentSheet
        deployment={selectedDeployment}
        connectionName={selectedDeployment?.connectionId ? connectionMap.get(selectedDeployment.connectionId)?.name : undefined}
        versionNumber={selectedDeployment ? versionMap.get(selectedDeployment.versionId)?.version : undefined}
        onClose={() => setSelectedDeployment(null)}
      />
    </div>
  )
}

function DeploymentSheet({
  deployment,
  connectionName,
  versionNumber,
  onClose,
}: {
  deployment: Deployment | null
  connectionName?: string
  versionNumber?: number
  onClose: () => void
}) {
  function handleOpenChange(open: boolean) {
    if (!open) onClose()
  }

  return (
    <Dialog.Root open={!!deployment} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
        <Dialog.Content className="fixed right-0 top-0 bottom-0 z-50 flex w-full max-w-md flex-col border-l border-border bg-background shadow-lg data-[state=open]:animate-in data-[state=open]:slide-in-from-right data-[state=open]:duration-200 data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=closed]:duration-150">
          <div className="flex items-center justify-between border-b border-border px-6 py-[1.125rem]">
            <Dialog.Title className="text-lg font-semibold">Deployment Details</Dialog.Title>
            <Dialog.Close className="rounded-md p-1 text-muted-foreground/60 transition-colors hover:bg-muted/60 hover:text-foreground/60">
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          {deployment && (
            <div className="flex-1 overflow-y-auto px-6 py-6">
              {/* Status */}
              <div className="flex items-center gap-2">
                {deployment.status === 'success' ? (
                  <span className="flex items-center gap-1.5 text-sm text-status-success">
                    <CheckCircle2 className="h-4 w-4" />
                    Successful
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-sm text-status-error">
                    <XCircle className="h-4 w-4" />
                    Failed
                  </span>
                )}
              </div>

              {/* Fields */}
              <div className="mt-8 grid gap-y-6">
                <Field label="Worker">
                  <span className="font-mono text-sm text-foreground">{deployment.serviceName}</span>
                </Field>

                <Field label="Connection">
                  <span className="text-sm text-foreground/70">{connectionName ?? deployment.connectionId}</span>
                </Field>

                <Field label="Version">
                  <span className="text-sm text-foreground/70">{versionNumber ? `v${versionNumber}` : deployment.versionId}</span>
                </Field>

                <Field label="Deployed">
                  <span className="text-sm text-foreground/70">{formatDate(deployment.createdAt)}</span>
                </Field>

                <Field label="Version ID">
                  <span className="font-mono text-sm text-muted-foreground">{deployment.versionId}</span>
                </Field>

                {deployment.serviceUrl && (
                  <Field label="URL">
                    <a
                      href={deployment.serviceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-sm text-primary hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {deployment.serviceUrl.replace(/^https?:\/\//, '')}
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </Field>
                )}

                <Field label="Deployment ID">
                  <span className="font-mono text-xs text-muted-foreground/60">{deployment.id}</span>
                </Field>
              </div>

              {/* Error */}
              {deployment.error && (
                <div className="mt-8">
                  <div className="mb-2 text-xs text-muted-foreground">Error</div>
                  <div className="rounded-md border border-red-500/10 bg-red-500/5 p-4">
                    <p className="text-sm leading-relaxed text-red-300">{deployment.error}</p>
                  </div>
                </div>
              )}


            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-xs text-muted-foreground">{label}</div>
      <div>{children}</div>
    </div>
  )
}
