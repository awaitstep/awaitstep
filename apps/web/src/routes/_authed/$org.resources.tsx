import { createFileRoute } from '@tanstack/react-router'
import { pageHead, type DashboardPage } from '../../components/navigation/dashboard-page'
import { PagePlaceholder } from '../../components/navigation/page-placeholder'

const page: DashboardPage = { kind: 'org', page: 'resources' }

export const Route = createFileRoute('/_authed/$org/resources')({
  staticData: { dashboardPage: page },
  head: () => pageHead(page),
  component: ResourcesPage,
})

function ResourcesPage() {
  return <PagePlaceholder title="Resources" boards="OrgResources" step="P7" />
}
