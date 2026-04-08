import * as Dialog from '@radix-ui/react-dialog'
import { CheckCircle2, XCircle, ExternalLink, X } from 'lucide-react'
import { formatDate } from '../../lib/time'

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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-xs text-muted-foreground">{label}</div>
      <div>{children}</div>
    </div>
  )
}

export function DeploymentSheet({
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
                  <span className="font-mono text-sm text-foreground">
                    {deployment.serviceName}
                  </span>
                </Field>

                <Field label="Connection">
                  <span className="text-sm text-foreground/70">
                    {connectionName ?? deployment.connectionId}
                  </span>
                </Field>

                <Field label="Version">
                  <span className="text-sm text-foreground/70">
                    {versionNumber ? `v${versionNumber}` : '-'}
                  </span>
                </Field>

                <Field label="Deployed">
                  <span className="text-sm text-foreground/70">
                    {formatDate(deployment.createdAt)}
                  </span>
                </Field>

                <Field label="Version ID">
                  <span className="font-mono text-sm text-muted-foreground">
                    {deployment.versionId}
                  </span>
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
                  <span className="font-mono text-xs text-muted-foreground/60">
                    {deployment.id}
                  </span>
                </Field>
              </div>

              {/* Error */}
              {deployment.error && (
                <div className="mt-8">
                  <div className="mb-2 text-xs text-muted-foreground">Error</div>
                  <div className="rounded-md border border-status-error bg-status-error/5 p-4">
                    <p className="whitespace-pre-wrap truncate text-sm leading-relaxed text-status-error">
                      {deployment.error}
                    </p>
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
