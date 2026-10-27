import { createFileRoute } from '@tanstack/react-router'
import { pageHead, type DashboardPage } from '../../components/navigation/dashboard-page'
import { OrgKeysPage } from '../../components/org-settings/org-keys-page'

const page: DashboardPage = { kind: 'org-settings', page: 'api-keys' }

export const Route = createFileRoute('/_authed/$org/settings/api-keys')({
  staticData: { dashboardPage: page },
  head: () => pageHead(page),
  component: OrgApiKeysPage,
})

function OrgApiKeysPage() {
  const { org } = Route.useParams()
  return <OrgKeysPage org={org} />
}
