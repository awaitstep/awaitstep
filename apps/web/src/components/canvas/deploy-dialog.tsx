import { useState } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { Rocket } from 'lucide-react'
import * as Dialog from '@radix-ui/react-dialog'
import { queries, flatPages } from '../../lib/queries'
import { useOrgReady } from '../../stores/org-store'
import { useConnectionsStore } from '../../stores/connections-store'
import { useDeployStream } from '../../hooks/use-deploy-stream'
import { IdleView } from './deploy/idle-view'
import { DeployingView } from './deploy/deploying-view'
import { SuccessView } from './deploy/success-view'
import { ErrorView } from './deploy/error-view'

interface DeployDialogProps {
  onClose: () => void
  workflowId: string
  versionId?: string
}

export function DeployDialog({ onClose, workflowId, versionId }: DeployDialogProps) {
  const ready = useOrgReady()
  const [connectionId, setConnectionId] = useState('')
  const connections = useConnectionsStore((s) => s.connections)
  const { state, progress, error, result, startDeploy, retry } = useDeployStream({
    workflowId,
    versionId,
  })

  const { data: deployments } = useInfiniteQuery({
    ...queries.deployments.byWorkflow(workflowId),
    enabled: ready,
    retry: false,
    select: (data) => flatPages(data),
  })

  function handleDeploy() {
    if (connectionId) startDeploy(connectionId)
  }

  const connectionName = connections?.find((c) => c.id === connectionId)?.name

  return (
    <Dialog.Root open onOpenChange={() => {}}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-md border border-border bg-card p-6 shadow-lg"
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <Dialog.Title className="flex items-center gap-2 text-base font-semibold text-foreground">
            <Rocket className="h-5 w-5" />
            Deploy Workflow
          </Dialog.Title>

          {state === 'idle' && (
            <IdleView
              connections={connections}
              connectionId={connectionId}
              onConnectionChange={setConnectionId}
              deployments={deployments}
              onDeploy={handleDeploy}
              onClose={onClose}
            />
          )}

          {state === 'deploying' && <DeployingView progress={progress} />}

          {state === 'success' && (
            <SuccessView result={result} connectionName={connectionName} onClose={onClose} />
          )}

          {state === 'error' && <ErrorView error={error} onRetry={retry} onClose={onClose} />}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
