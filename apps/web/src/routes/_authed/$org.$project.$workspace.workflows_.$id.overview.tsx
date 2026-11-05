import { createFileRoute } from '@tanstack/react-router'
import { pageHead, type DashboardPage } from '../../components/navigation/dashboard-page'
import { ItemPage } from '../../components/workflow-detail/item-page'
import { FunctionBody } from '../../components/workflow-detail/function-body'
import { OverviewBody } from '../../components/workflow-detail/overview-body'

const page: DashboardPage = { kind: 'item', page: 'overview' }

export const Route = createFileRoute('/_authed/$org/$project/$workspace/workflows_/$id/overview')({
  staticData: { dashboardPage: page },
  head: () => pageHead(page),
  component: OverviewRoute,
})

function OverviewRoute() {
  const { id, ...slugs } = Route.useParams()
  return (
    <ItemPage slugs={slugs} workflowId={id} page="overview">
      {(data) =>
        data.workflow.kind === 'script' ? <FunctionBody {...data} /> : <OverviewBody {...data} />
      }
    </ItemPage>
  )
}
