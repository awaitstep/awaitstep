import { createFileRoute } from '@tanstack/react-router'
import { pageHead, type DashboardPage } from '../../components/navigation/dashboard-page'
import { WorkspacesPage } from '../../components/project-settings/workspaces-page'

const page: DashboardPage = { kind: 'project', page: 'workspaces' }

export const Route = createFileRoute('/_authed/$org/$project/workspaces')({
  staticData: { dashboardPage: page },
  head: () => pageHead(page),
  validateSearch: (search: Record<string, unknown>) => ({
    new: search.new === 'workspace' ? ('workspace' as const) : undefined,
  }),
  component: ProjectWorkspacesPage,
})

function ProjectWorkspacesPage() {
  const slugs = Route.useParams()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()

  function handleDialogChange(open: boolean) {
    void navigate({
      search: (prev) => ({ ...prev, new: open ? ('workspace' as const) : undefined }),
      replace: !open,
    })
  }

  return (
    <WorkspacesPage
      slugs={slugs}
      dialogOpen={search.new === 'workspace'}
      onDialogChange={handleDialogChange}
    />
  )
}
