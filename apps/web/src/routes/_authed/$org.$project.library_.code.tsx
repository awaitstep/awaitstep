import { createFileRoute } from '@tanstack/react-router'
import { pageHead, type DashboardPage } from '../../components/navigation/dashboard-page'
import { ProjectLibraryCode } from '../../components/library-ide/library-code-scopes'
import { parseLibraryCodeSearch } from '../../lib/library/code-search'

const page: DashboardPage = { kind: 'editor' }

// The project's Library IDE, full screen.
export const Route = createFileRoute('/_authed/$org/$project/library_/code')({
  staticData: { dashboardPage: page },
  head: () => pageHead(page),
  validateSearch: parseLibraryCodeSearch,
  component: ProjectLibraryCodeRoute,
})

function ProjectLibraryCodeRoute() {
  const slugs = Route.useParams()
  const open = Route.useSearch()
  return <ProjectLibraryCode slugs={slugs} open={open} />
}
