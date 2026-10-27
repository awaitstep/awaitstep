import { createFileRoute } from '@tanstack/react-router'
import { pageHead, type DashboardPage } from '../../components/navigation/dashboard-page'
import { PagePlaceholder } from '../../components/navigation/page-placeholder'

const page: DashboardPage = { kind: 'workspace', page: 'overview' }

export const Route = createFileRoute('/_authed/$org/$project/$workspace/overview')({
  staticData: { dashboardPage: page },
  head: () => pageHead(page),
  component: OverviewPage,
})

function OverviewPage() {
  return <PagePlaceholder title="Overview" boards="WsOverview" step="P2" />
}
