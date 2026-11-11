import { createFileRoute } from '@tanstack/react-router'
import { pageHead, type DashboardPage } from '../../components/navigation/dashboard-page'
import { RunDetail } from '../../components/monitoring/run-detail'
import { ItemPage } from '../../components/workflow-detail/item-page'

const page: DashboardPage = { kind: 'item', page: 'run' }

export const Route = createFileRoute(
  '/_authed/$org/$project/$workspace/workflows_/$id/runs/$runId',
)({
  staticData: { dashboardPage: page },
  head: () => pageHead(page),
  component: RunRoute,
})

function RunRoute() {
  const { id, runId, ...slugs } = Route.useParams()
  return (
    <ItemPage slugs={slugs} workflowId={id} page="run">
      {({ workflow }) => (
        <RunDetail slugs={slugs} runId={runId} workflowId={id} kind={workflow.kind} />
      )}
    </ItemPage>
  )
}
