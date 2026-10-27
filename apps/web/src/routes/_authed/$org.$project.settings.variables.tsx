import { createFileRoute } from '@tanstack/react-router'
import { pageHead, type DashboardPage } from '../../components/navigation/dashboard-page'
import { PagePlaceholder } from '../../components/navigation/page-placeholder'

const page: DashboardPage = { kind: 'project-settings', page: 'variables' }

export const Route = createFileRoute('/_authed/$org/$project/settings/variables')({
  staticData: { dashboardPage: page },
  head: () => pageHead(page),
  component: ProjectVariablesPage,
})

function ProjectVariablesPage() {
  return <PagePlaceholder title="Variables" boards="ProjectVariables" step="P3" />
}
