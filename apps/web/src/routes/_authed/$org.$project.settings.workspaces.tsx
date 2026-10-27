import { createFileRoute } from '@tanstack/react-router'
import { pageHead, type DashboardPage } from '../../components/navigation/dashboard-page'
import { WorkspacesPage } from '../../components/project-settings/workspaces-page'

const page: DashboardPage = { kind: 'project-settings', page: 'workspaces' }

export const Route = createFileRoute('/_authed/$org/$project/settings/workspaces')({
  staticData: { dashboardPage: page },
  head: () => pageHead(page),
  component: ProjectWorkspacesPage,
})

function ProjectWorkspacesPage() {
  const slugs = Route.useParams()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()

  function handleDialogChange(open: boolean) {
    void navigate({
      search: (prev) => ({ ...prev, new: open ? 'workspace' : undefined }),
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
