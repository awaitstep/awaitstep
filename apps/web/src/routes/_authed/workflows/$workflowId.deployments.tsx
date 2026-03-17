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

export const Route = createFileRoute('/_authed/workflows/$workflowId/deployments')({
  component: DeploymentsPage,
})

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

type Deployment = {
  id: string
  workflowId: string
  versionId: string
  connectionId: string
  serviceName: string
  serviceUrl: string | null
  status: string
  error: string | null
  createdAt: string
}

function DeploymentsPage() {
  const { workflowId } = useParams({ from: '/_authed/workflows/$workflowId/deployments' })
  const [deployOpen, setDeployOpen] = useState(false)
  const [selectedDeployment, setSelectedDeployment] = useState<Deployment | null>(null)

  const { data: deployments, isLoading } = useQuery({
    queryKey: ['deployments', workflowId],
    queryFn: () => api.listDeployments(workflowId),
  })

  const { data: connections } = useQuery({
    queryKey: ['connections'],
    queryFn: () => api.listConnections(),
  })

  const connectionMap = new Map(connections?.map((c) => [c.id, c]) ?? [])

  return (
    <div>
      <div className="mb-6 flex items-center justify-end">
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
        <div className="overflow-hidden border border-border">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/60">Status</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/60">Worker</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/60">Connection</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/60">URL</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground/60">Deployed</th>
              </tr>
            </thead>
            <tbody>
              {deployments.map((d, i) => {
                const conn = connectionMap.get(d.connectionId)
                return (
                  <tr
                    key={d.id}
                    onClick={() => setSelectedDeployment(d)}
                    className="cursor-pointer border-b border-border/50 last:border-0 transition-colors hover:bg-muted/30"
                  >
                    <td className="px-4 py-3">
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
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-foreground/70">{d.serviceName}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{conn?.name ?? '--'}</td>
                    <td className="px-4 py-3">
                      {d.serviceUrl ? (
                        <span className="text-xs text-primary">
                          {d.serviceUrl.replace(/^https?:\/\//, '')}
                        </span>
                      ) : d.error ? (
                        <span className="text-xs text-status-error/60 truncate block max-w-xs">{d.error}</span>
                      ) : (
                        <span className="text-xs text-muted-foreground/40">--</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{timeAgo(d.createdAt)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <DeployDialog open={deployOpen} onClose={() => setDeployOpen(false)} workflowId={workflowId} />

      <DeploymentSheet
        deployment={selectedDeployment}
        connectionName={selectedDeployment ? connectionMap.get(selectedDeployment.connectionId)?.name : undefined}
        onClose={() => setSelectedDeployment(null)}
      />
    </div>
  )
}

function DeploymentSheet({
  deployment,
  connectionName,
  onClose,
}: {
  deployment: Deployment | null
  connectionName?: string
  onClose: () => void
}) {
  return (
    <Dialog.Root open={!!deployment} onOpenChange={(open) => { if (!open) onClose() }}>
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
