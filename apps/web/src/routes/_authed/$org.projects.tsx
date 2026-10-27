import { createFileRoute } from '@tanstack/react-router'
import { pageHead, type DashboardPage } from '../../components/navigation/dashboard-page'
import { PagePlaceholder } from '../../components/navigation/page-placeholder'

const page: DashboardPage = { kind: 'org', page: 'projects' }

export const Route = createFileRoute('/_authed/$org/projects')({
  staticData: { dashboardPage: page },
  head: () => pageHead(page),
  component: ProjectsPage,
})

function ProjectsPage() {
  return <PagePlaceholder title="Projects" boards="Main and EmptyOrg" step="P1" />
}
