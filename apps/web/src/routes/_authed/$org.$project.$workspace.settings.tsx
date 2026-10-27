import { createFileRoute } from '@tanstack/react-router'
import { pageHead, type DashboardPage } from '../../components/navigation/dashboard-page'
import { PagePlaceholder } from '../../components/navigation/page-placeholder'

const page: DashboardPage = { kind: 'workspace', page: 'settings' }

export const Route = createFileRoute('/_authed/$org/$project/$workspace/settings')({
  staticData: { dashboardPage: page },
  head: () => pageHead(page),
  component: WorkspaceSettingsPage,
})

function WorkspaceSettingsPage() {
  return <PagePlaceholder title="Workspace settings" boards="Access" step="P4" />
}
