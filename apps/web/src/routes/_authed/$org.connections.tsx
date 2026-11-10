import { useCallback } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { pageHead, type DashboardPage } from '../../components/navigation/dashboard-page'
import { useOAuthResultToast } from '../../components/org-settings/use-oauth-result-toast'
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
  const clearOAuth = useCallback(() => {
    void navigate({
      search: (prev) => ({
        ...prev,
        oauth: undefined,
        account: undefined,
        reason: undefined,
        connected: undefined,
      }),
      replace: true,
    })
  }, [navigate])
  useOAuthResultToast(search, clearOAuth)

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
