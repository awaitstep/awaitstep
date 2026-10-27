import { createFileRoute } from '@tanstack/react-router'
import { pageHead, type DashboardPage } from '../../components/navigation/dashboard-page'
import { searchForTab } from '../../components/navigation/tab-search'
import { ResourcesPage, resourcesTabFrom } from '../../components/resources/resources-page'
import { variableRequestFrom } from '../../components/variables/variable-requests'

const page: DashboardPage = { kind: 'org', page: 'resources' }

export const Route = createFileRoute('/_authed/$org/resources')({
  staticData: { dashboardPage: page },
  head: () => pageHead(page),
  component: OrgResourcesPage,
})

function OrgResourcesPage() {
  const { org } = Route.useParams()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()

  function handleTabChange(tab: string) {
    void navigate({ search: (prev) => searchForTab(prev, tab, 'nodes'), replace: true })
  }

  function handleCloseDialog() {
    void navigate({
      search: (prev) => ({ ...prev, new: undefined, variable: undefined }),
      replace: true,
    })
  }

  return (
    <ResourcesPage
      org={org}
      tab={resourcesTabFrom(search.tab)}
      onTabChange={handleTabChange}
      variableRequest={variableRequestFrom(search)}
      onCloseDialog={handleCloseDialog}
    />
  )
}
