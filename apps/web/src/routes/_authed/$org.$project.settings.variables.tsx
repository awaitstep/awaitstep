import { createFileRoute } from '@tanstack/react-router'
import { pageHead, type DashboardPage } from '../../components/navigation/dashboard-page'
import { VariablesPage } from '../../components/project-settings/variables-page'

const page: DashboardPage = { kind: 'project-settings', page: 'variables' }

export const Route = createFileRoute('/_authed/$org/$project/settings/variables')({
  staticData: { dashboardPage: page },
  head: () => pageHead(page),
  component: ProjectVariablesPage,
})

function ProjectVariablesPage() {
  const slugs = Route.useParams()
  return <VariablesPage slugs={slugs} />
}
