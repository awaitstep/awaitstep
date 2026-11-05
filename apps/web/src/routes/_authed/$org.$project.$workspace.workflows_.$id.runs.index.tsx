import { createFileRoute } from '@tanstack/react-router'
import { pageHead, type DashboardPage } from '../../components/navigation/dashboard-page'
import { FunctionHasNoRuns } from '../../components/workflow-detail/function-has-no-runs'
import { ItemPage } from '../../components/workflow-detail/item-page'
import { RunsTab } from '../../components/workflow-detail/runs-tab'

const page: DashboardPage = { kind: 'item', page: 'runs' }

export const Route = createFileRoute('/_authed/$org/$project/$workspace/workflows_/$id/runs/')({
  staticData: { dashboardPage: page },
  head: () => pageHead(page),
  component: RunsRoute,
})

function RunsRoute() {
  const { id, ...slugs } = Route.useParams()
  return (
    <ItemPage slugs={slugs} workflowId={id} page="runs">
      {({ workflow, overview, runs24h }) =>
        workflow.kind === 'script' ? (
          <FunctionHasNoRuns workflowId={id} />
        ) : (
          <RunsTab workflowId={id} versions={overview.versions} runs24h={runs24h} />
        )
      }
    </ItemPage>
  )
}
