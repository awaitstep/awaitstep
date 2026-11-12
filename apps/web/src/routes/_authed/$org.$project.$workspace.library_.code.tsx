import { createFileRoute } from '@tanstack/react-router'
import { pageHead, type DashboardPage } from '../../components/navigation/dashboard-page'
import { WorkspaceLibraryCode } from '../../components/library-ide/library-code-scopes'
import { parseLibraryCodeSearch } from '../../lib/library/code-search'

const page: DashboardPage = { kind: 'editor' }

// The Library IDE, full screen, like a workflow's code view.
export const Route = createFileRoute('/_authed/$org/$project/$workspace/library_/code')({
  staticData: { dashboardPage: page },
  head: () => pageHead(page),
  validateSearch: parseLibraryCodeSearch,
  component: WorkspaceLibraryCodeRoute,
})

function WorkspaceLibraryCodeRoute() {
  const slugs = Route.useParams()
  const open = Route.useSearch()
  return <WorkspaceLibraryCode slugs={slugs} open={open} />
}
