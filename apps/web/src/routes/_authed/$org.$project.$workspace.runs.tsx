import { createFileRoute } from '@tanstack/react-router'
import { pageHead, type DashboardPage } from '../../components/navigation/dashboard-page'
import { PagePlaceholder } from '../../components/navigation/page-placeholder'

const page: DashboardPage = { kind: 'workspace', page: 'runs' }

export const Route = createFileRoute('/_authed/$org/$project/$workspace/runs')({
  staticData: { dashboardPage: page },
  head: () => pageHead(page),
  component: RunsPage,
})

function RunsPage() {
  return <PagePlaceholder title="Runs" boards="WsRuns" step="P2" />
}
