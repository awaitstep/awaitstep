import { createFileRoute } from '@tanstack/react-router'
import { pageHead, type DashboardPage } from '../../components/navigation/dashboard-page'
import { OrgConnectionsPage } from '../../components/org-settings/org-connections-page'

const page: DashboardPage = { kind: 'org', page: 'connections' }

export const Route = createFileRoute('/_authed/$org/connections')({
  staticData: { dashboardPage: page },
  head: () => pageHead(page),
  component: OrgConnectionsRoute,
})

function OrgConnectionsRoute() {
  const { org } = Route.useParams()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()

  function handleConnectChange(open: boolean) {
    void navigate({
      search: (prev) => ({ ...prev, new: open ? 'connection' : undefined }),
      replace: !open,
    })
  }

  return (
    <OrgConnectionsPage
      org={org}
      connectOpen={search.new === 'connection'}
      onConnectChange={handleConnectChange}
    />
  )
}
