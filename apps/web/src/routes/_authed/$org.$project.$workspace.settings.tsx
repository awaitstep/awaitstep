import { createFileRoute } from '@tanstack/react-router'
import { pageHead, type DashboardPage } from '../../components/navigation/dashboard-page'
import {
  WorkspaceSettingsPage,
  searchForTab,
  tabFrom,
} from '../../components/workspace-settings/workspace-settings-page'
import { variableRequestFrom } from '../../components/variables/variable-requests'

const page: DashboardPage = { kind: 'workspace', page: 'settings' }

export const Route = createFileRoute('/_authed/$org/$project/$workspace/settings')({
  staticData: { dashboardPage: page },
  head: () => pageHead(page),
  component: WorkspaceSettingsRoute,
})

function WorkspaceSettingsRoute() {
  const slugs = Route.useParams()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()

  function handleTabChange(tab: string) {
    void navigate({ search: (prev) => searchForTab(prev, tab), replace: true })
  }

  function handleCloseDialog() {
    void navigate({
      search: (prev) => ({ ...prev, new: undefined, variable: undefined }),
      replace: true,
    })
  }

  return (
    <WorkspaceSettingsPage
      slugs={slugs}
      tab={tabFrom(search.tab)}
      onTabChange={handleTabChange}
      dialog={search.new}
      variableRequest={variableRequestFrom(search)}
      onCloseDialog={handleCloseDialog}
    />
  )
}
