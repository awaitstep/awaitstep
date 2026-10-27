import { createFileRoute } from '@tanstack/react-router'
import { pageHead, type DashboardPage } from '../../components/navigation/dashboard-page'
import { LibraryPage } from '../../components/library/library-page'

const page: DashboardPage = { kind: 'workspace', page: 'library' }

export const Route = createFileRoute('/_authed/$org/$project/$workspace/library')({
  staticData: { dashboardPage: page },
  head: () => pageHead(page),
  component: LibraryRoute,
})

function LibraryRoute() {
  const slugs = Route.useParams()
  return <LibraryPage slugs={slugs} />
}
