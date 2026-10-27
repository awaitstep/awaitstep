import { createFileRoute } from '@tanstack/react-router'
import { pageHead, type DashboardPage } from '../../components/navigation/dashboard-page'
import { PagePlaceholder } from '../../components/navigation/page-placeholder'

const page: DashboardPage = { kind: 'project-settings', page: 'api-keys' }

export const Route = createFileRoute('/_authed/$org/$project/settings/api-keys')({
  staticData: { dashboardPage: page },
  head: () => pageHead(page),
  component: ProjectApiKeysPage,
})

function ProjectApiKeysPage() {
  return <PagePlaceholder title="API keys" boards="KeysPage" step="P3" />
}
