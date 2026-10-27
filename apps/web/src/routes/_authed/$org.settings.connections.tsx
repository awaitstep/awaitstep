import { createFileRoute } from '@tanstack/react-router'
import { pageHead, type DashboardPage } from '../../components/navigation/dashboard-page'
import { PagePlaceholder } from '../../components/navigation/page-placeholder'

const page: DashboardPage = { kind: 'org-settings', page: 'connections' }

export const Route = createFileRoute('/_authed/$org/settings/connections')({
  staticData: { dashboardPage: page },
  head: () => pageHead(page),
  component: OrgConnectionsPage,
})

function OrgConnectionsPage() {
  return <PagePlaceholder title="Connections" boards="OrgConnections" step="P5" />
}
