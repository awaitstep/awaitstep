import { createFileRoute } from '@tanstack/react-router'
import { pageHead, type DashboardPage } from '../../components/navigation/dashboard-page'
import { ProjectLibraryPage } from '../../components/library/library-page-scopes'

const page: DashboardPage = { kind: 'project', page: 'library' }

export const Route = createFileRoute('/_authed/$org/$project/library')({
  staticData: { dashboardPage: page },
  head: () => pageHead(page),
  component: ProjectLibraryRoute,
})

function ProjectLibraryRoute() {
  const slugs = Route.useParams()
  return <ProjectLibraryPage slugs={slugs} />
}
