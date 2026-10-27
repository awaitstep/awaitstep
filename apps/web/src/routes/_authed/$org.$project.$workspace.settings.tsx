import { createFileRoute } from '@tanstack/react-router'
import { pageHead, type DashboardPage } from '../../components/navigation/dashboard-page'
import {
  WorkspaceSettingsPage,
  searchForTab,
  tabFrom,
} from '../../components/workspace-settings/workspace-settings-page'

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

  return (
    <WorkspaceSettingsPage slugs={slugs} tab={tabFrom(search.tab)} onTabChange={handleTabChange} />
  )
}
