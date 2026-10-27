import { createFileRoute } from '@tanstack/react-router'
import { pageHead, type DashboardPage } from '../../components/navigation/dashboard-page'
import { PagePlaceholder } from '../../components/navigation/page-placeholder'

const page: DashboardPage = { kind: 'org-settings', page: 'api-keys' }

export const Route = createFileRoute('/_authed/$org/settings/api-keys')({
  staticData: { dashboardPage: page },
  head: () => pageHead(page),
  component: OrgApiKeysPage,
})

function OrgApiKeysPage() {
  return <PagePlaceholder title="API keys" boards="OrgApiKeys" step="P5" />
}
