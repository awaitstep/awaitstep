import { createFileRoute } from '@tanstack/react-router'
import { pageHead, type DashboardPage } from '../../components/navigation/dashboard-page'
import { WorkspaceOverviewPage } from '../../components/workspaces/workspace-overview-page'

const page: DashboardPage = { kind: 'workspace', page: 'overview' }

export const Route = createFileRoute('/_authed/$org/$project/$workspace/overview')({
  staticData: { dashboardPage: page },
  head: () => pageHead(page),
  component: OverviewRoute,
})

function OverviewRoute() {
  const slugs = Route.useParams()
  return <WorkspaceOverviewPage slugs={slugs} />
}
