import { createFileRoute } from '@tanstack/react-router'
import { pageHead, type DashboardPage } from '../../components/navigation/dashboard-page'
import { DeploymentsTab } from '../../components/workflow-detail/deployments-tab'
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
      {({ overview, accounts }) => (
        <DeploymentsTab
          workflowId={id}
          accounts={accounts}
          deployBlocked={overview.deployBlocked}
        />
      )}
    </ItemPage>
  )
}
