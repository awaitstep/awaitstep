import { createFileRoute } from '@tanstack/react-router'
import { pageHead, type DashboardPage } from '../../components/navigation/dashboard-page'
import { OrgGeneralPage } from '../../components/org-settings/org-general-page'

const page: DashboardPage = { kind: 'org-settings', page: 'general' }

export const Route = createFileRoute('/_authed/$org/settings/general')({
  staticData: { dashboardPage: page },
  head: () => pageHead(page),
  component: OrgGeneralRoute,
})

function OrgGeneralRoute() {
  const { org } = Route.useParams()
  return <OrgGeneralPage org={org} />
}
