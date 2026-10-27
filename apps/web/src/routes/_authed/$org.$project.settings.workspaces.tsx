import { createFileRoute } from '@tanstack/react-router'
import { pageHead, type DashboardPage } from '../../components/navigation/dashboard-page'
import { PagePlaceholder } from '../../components/navigation/page-placeholder'

const page: DashboardPage = { kind: 'project-settings', page: 'workspaces' }

export const Route = createFileRoute('/_authed/$org/$project/settings/workspaces')({
  staticData: { dashboardPage: page },
  head: () => pageHead(page),
  component: ProjectWorkspacesPage,
})

function ProjectWorkspacesPage() {
  return <PagePlaceholder title="Workspaces" boards="ProjectOverview" step="P3" />
}
