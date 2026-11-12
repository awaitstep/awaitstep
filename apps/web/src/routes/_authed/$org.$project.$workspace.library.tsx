import { createFileRoute } from '@tanstack/react-router'
import { pageHead, type DashboardPage } from '../../components/navigation/dashboard-page'
import { WorkspaceLibraryPage } from '../../components/library/library-page-scopes'

const page: DashboardPage = { kind: 'workspace', page: 'library' }

export const Route = createFileRoute('/_authed/$org/$project/$workspace/library')({
  staticData: { dashboardPage: page },
  head: () => pageHead(page),
  component: LibraryRoute,
})

function LibraryRoute() {
  const slugs = Route.useParams()
  return <WorkspaceLibraryPage slugs={slugs} />
}
