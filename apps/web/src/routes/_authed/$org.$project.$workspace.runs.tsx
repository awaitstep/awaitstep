import { createFileRoute } from '@tanstack/react-router'
import { pageHead, type DashboardPage } from '../../components/navigation/dashboard-page'
import { RunsPage } from '../../components/runs/runs-page'

const page: DashboardPage = { kind: 'workspace', page: 'runs' }

export const Route = createFileRoute('/_authed/$org/$project/$workspace/runs')({
  staticData: { dashboardPage: page },
  head: () => pageHead(page),
  component: RunsRoute,
})

function RunsRoute() {
  const slugs = Route.useParams()
  return <RunsPage slugs={slugs} />
}
