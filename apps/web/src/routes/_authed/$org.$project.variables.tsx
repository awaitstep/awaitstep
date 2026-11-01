import { createFileRoute } from '@tanstack/react-router'
import { pageHead, type DashboardPage } from '../../components/navigation/dashboard-page'
import { VariablesPage } from '../../components/project-settings/variables-page'
import { variableRequestFrom } from '../../components/variables/variable-requests'

const page: DashboardPage = { kind: 'project', page: 'variables' }

export const Route = createFileRoute('/_authed/$org/$project/variables')({
  staticData: { dashboardPage: page },
  head: () => pageHead(page),
  component: ProjectVariablesPage,
})

function ProjectVariablesPage() {
  const slugs = Route.useParams()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()

  function handleCloseDialog() {
    void navigate({
      search: (prev) => ({ ...prev, new: undefined, variable: undefined }),
      replace: true,
    })
  }

  return (
    <VariablesPage
      slugs={slugs}
      request={variableRequestFrom(search)}
      onCloseDialog={handleCloseDialog}
    />
  )
}
