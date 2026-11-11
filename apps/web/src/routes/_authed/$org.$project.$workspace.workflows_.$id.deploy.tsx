import { createFileRoute } from '@tanstack/react-router'
import { pageHead, type DashboardPage } from '../../components/navigation/dashboard-page'
import { DeployBody } from '../../components/workflow-detail/deploy-body'
import { ItemPage } from '../../components/workflow-detail/item-page'
import { parseDeploySearch } from '../../lib/workflows/deploy-search'

const page: DashboardPage = { kind: 'item', page: 'deploy' }

export const Route = createFileRoute('/_authed/$org/$project/$workspace/workflows_/$id/deploy')({
  staticData: { dashboardPage: page },
  head: () => pageHead(page),
  // `?version=`: deploy that version (Deploy on the Versions card, Roll back), not the current one.
  // `?connection=`: to that account (Roll back on one account's row).
  validateSearch: parseDeploySearch,
  component: DeployRoute,
})

function DeployRoute() {
  const { id, ...slugs } = Route.useParams()
  const { version, connection } = Route.useSearch()
  return (
    <ItemPage slugs={slugs} workflowId={id} page="deploy">
      {({ workflow, overview }) => (
        <DeployBody
          workflow={workflow}
          live={overview.live}
          versionId={version}
          connectionId={connection}
        />
      )}
    </ItemPage>
  )
}
