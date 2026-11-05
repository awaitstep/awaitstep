import { useState } from 'react'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Rocket } from 'lucide-react'
import { flatPages } from '../../lib/queries'
import { useWorkflowLinks } from '../../lib/workflows/detail-links'
import { useConnectionsStore } from '../../stores/connections-store'
import { DeploymentSheet } from '../deployments/deployment-sheet'
import { DeploymentsList } from '../deployments/deployments-list'
import { RouterShellLink } from '../navigation/router-shell-link'
import { Button } from '../ui/button'
import { LoadMoreButton } from '../ui/load-more-button'
import { LoadingView } from '../ui/loading-view'
import { ListSkeleton } from '../ui/skeletons'
import { useQueries } from '../../contexts/api-client-context'

interface DeploymentsPanelProps {
  workflowId: string
  /** Holds every read until API calls follow the right project. */
  ready: boolean
}

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

/** A workflow's deployments, newest first; one opens in a sheet. */
export function DeploymentsPanel({ workflowId, ready }: DeploymentsPanelProps) {
  const queries = useQueries()
  const links = useWorkflowLinks(workflowId)
  const [selectedDeployment, setSelectedDeployment] = useState<Deployment | null>(null)

  const {
    data: deploymentsData,
    isLoading,
    hasNextPage: deploymentsHasMore,
    fetchNextPage: deploymentsFetchNext,
    isFetchingNextPage: deploymentsLoading,
  } = useInfiniteQuery({ ...queries.deployments.byWorkflow(workflowId), enabled: ready })
  const deployments = flatPages(deploymentsData)

  const orgConnections = useConnectionsStore((s) => s.connections)
  // A project's own accounts aren't in the org's list: named from the project's.
  const { data: projectConnections } = useQuery({
    ...queries.connections.forDeploy(workflowId),
    enabled: ready,
  })

  const { data: versions } = useInfiniteQuery({
    ...queries.versions.byWorkflow(workflowId),
    enabled: ready,
    select: (data) => flatPages(data),
  })

  const connectionMap = new Map(
    [...orgConnections, ...(projectConnections?.connections ?? [])].map((c) => [
      c.id,
      { id: c.id, name: c.name },
    ]),
  )
  const versionMap = new Map(versions?.map((v) => [v.id, v]) ?? [])

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <RouterShellLink href={links.deploy}>
          <Button size="sm" className="gap-1.5">
            <Rocket className="h-3.5 w-3.5" />
            New Deployment
          </Button>
        </RouterShellLink>
      </div>

      <LoadingView isLoading={isLoading || !ready} LoadingPlaceholder={ListSkeleton}>
        {deployments && deployments.length === 0 ? (
          <div className="rounded-md border border-border px-4 py-8 text-center text-sm text-muted-foreground">
            No deployments yet.{' '}
            <RouterShellLink href={links.deploy} className="text-primary hover:underline">
              Deploy your workflow
            </RouterShellLink>{' '}
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
