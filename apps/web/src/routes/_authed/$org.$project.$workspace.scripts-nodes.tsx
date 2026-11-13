import { createFileRoute } from '@tanstack/react-router'
import { pageHead, type DashboardPage } from '../../components/navigation/dashboard-page'
import { WorkspaceLibraryPage } from '../../components/library/library-page-scopes'

const page: DashboardPage = { kind: 'workspace', page: 'scripts-nodes' }

export const Route = createFileRoute('/_authed/$org/$project/$workspace/scripts-nodes')({
  staticData: { dashboardPage: page },
  head: () => pageHead(page),
  component: LibraryRoute,
})

function LibraryRoute() {
  const slugs = Route.useParams()
  return <WorkspaceLibraryPage slugs={slugs} />
}
