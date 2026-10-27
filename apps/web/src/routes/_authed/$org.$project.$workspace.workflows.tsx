import { createFileRoute } from '@tanstack/react-router'
import { pageHead, type DashboardPage } from '../../components/navigation/dashboard-page'
import { WorkflowsPage } from '../../components/items/workflows-page'

const page: DashboardPage = { kind: 'workspace', page: 'workflows' }

export const Route = createFileRoute('/_authed/$org/$project/$workspace/workflows')({
  staticData: { dashboardPage: page },
  head: () => pageHead(page),
  component: WorkflowsRoute,
})

function WorkflowsRoute() {
  const slugs = Route.useParams()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()

  function handleCloseDialog() {
    void navigate({ search: (prev) => ({ ...prev, new: undefined }), replace: true })
  }

  return <WorkflowsPage slugs={slugs} dialog={search.new} onCloseDialog={handleCloseDialog} />
}
