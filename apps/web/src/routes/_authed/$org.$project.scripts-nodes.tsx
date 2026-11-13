import { createFileRoute } from '@tanstack/react-router'
import { pageHead, type DashboardPage } from '../../components/navigation/dashboard-page'
import { ProjectLibraryPage } from '../../components/library/library-page-scopes'

const page: DashboardPage = { kind: 'project', page: 'scripts-nodes' }

export const Route = createFileRoute('/_authed/$org/$project/scripts-nodes')({
  staticData: { dashboardPage: page },
  head: () => pageHead(page),
  component: ProjectLibraryRoute,
})

function ProjectLibraryRoute() {
  const slugs = Route.useParams()
  return <ProjectLibraryPage slugs={slugs} />
}
