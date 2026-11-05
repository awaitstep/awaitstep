import { createFileRoute } from '@tanstack/react-router'
import { pageHead, type DashboardPage } from '../../components/navigation/dashboard-page'
import { DeploymentsPanel } from '../../components/workflow-detail/deployments-panel'
import { ItemPage } from '../../components/workflow-detail/item-page'

const page: DashboardPage = { kind: 'item', page: 'deployments' }

export const Route = createFileRoute(
  '/_authed/$org/$project/$workspace/workflows_/$id/deployments',
)({
  staticData: { dashboardPage: page },
  head: () => pageHead(page),
  component: DeploymentsRoute,
})

function DeploymentsRoute() {
  const { id, ...slugs } = Route.useParams()
  return (
    <ItemPage slugs={slugs} workflowId={id} page="deployments">
      {() => <DeploymentsPanel workflowId={id} ready />}
    </ItemPage>
  )
}
