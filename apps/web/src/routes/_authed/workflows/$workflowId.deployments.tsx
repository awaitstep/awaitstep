import { createFileRoute, useParams } from '@tanstack/react-router'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Rocket } from 'lucide-react'
import { Button } from '../../../components/ui/button'
import { DeployDialog } from '../../../components/canvas/deploy-dialog'
import { DeploymentsList } from '../../../components/deployments/deployments-list'
import { DeploymentSheet } from '../../../components/deployments/deployment-sheet'
import { queries, flatPages } from '../../../lib/queries'
import { useOrgReady } from '../../../stores/org-store'
import { useConnectionsStore } from '../../../stores/connections-store'
import { LoadingView } from '../../../components/ui/loading-view'
import { LoadMoreButton } from '../../../components/ui/load-more-button'
import { ListSkeleton } from '../../../components/ui/skeletons'

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

  const {
    data: deploymentsData,
    isLoading,
    hasNextPage: deploymentsHasMore,
    fetchNextPage: deploymentsFetchNext,
    isFetchingNextPage: deploymentsLoading,
  } = useInfiniteQuery({ ...queries.deployments.byWorkflow(workflowId), enabled: ready })
  const deployments = flatPages(deploymentsData)

  const connections = useConnectionsStore((s) => s.connections)

  const { data: versions } = useInfiniteQuery({
    ...queries.versions.byWorkflow(workflowId),
    enabled: ready,
    select: (data) => flatPages(data),
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

      <LoadingView isLoading={isLoading} LoadingPlaceholder={ListSkeleton}>
        {deployments && deployments.length === 0 ? (
          <div className="rounded-md border border-border px-4 py-8 text-center text-sm text-muted-foreground">
            No deployments yet.{' '}
            <button onClick={() => setDeployOpen(true)} className="text-primary hover:underline">
              Deploy your workflow
            </button>{' '}
            to see history here.
          </div>
        ) : (
          <>
            <DeploymentsList
              deployments={deployments ?? []}
              connectionMap={connectionMap}
              onSelect={setSelectedDeployment}
            />
            <LoadMoreButton
              hasMore={!!deploymentsHasMore}
              loading={deploymentsLoading}
              onClick={() => deploymentsFetchNext()}
            />
          </>
        )}
      </LoadingView>

      {deployOpen && <DeployDialog onClose={() => setDeployOpen(false)} workflowId={workflowId} />}

      <DeploymentSheet
        deployment={selectedDeployment}
        connectionName={
          selectedDeployment?.connectionId
            ? connectionMap.get(selectedDeployment.connectionId)?.name
            : undefined
        }
        versionNumber={
          selectedDeployment ? versionMap.get(selectedDeployment.versionId)?.version : undefined
        }
        onClose={() => setSelectedDeployment(null)}
      />
    </div>
  )
}
