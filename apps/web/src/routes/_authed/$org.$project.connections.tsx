import { useCallback } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { pageHead, type DashboardPage } from '../../components/navigation/dashboard-page'
import { useOAuthResultToast } from '../../components/org-settings/use-oauth-result-toast'
import { ProjectConnectionsPage } from '../../components/project-connections/project-connections-page'

const page: DashboardPage = { kind: 'project', page: 'connections' }

export const Route = createFileRoute('/_authed/$org/$project/connections')({
  staticData: { dashboardPage: page },
  head: () => pageHead(page),
  component: ProjectConnectionsRoute,
})

/** `?new=connection` opens Add connection; `&tab=new` on *Connect a new account*. */
function ProjectConnectionsRoute() {
  const slugs = Route.useParams()
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

  function handleAddChange(open: boolean, tab?: 'org' | 'new') {
    void navigate({
      search: (prev) => ({
        ...prev,
        new: open ? 'connection' : undefined,
        tab: open && tab === 'new' ? 'new' : undefined,
      }),
      replace: !open,
    })
  }

  return (
    <ProjectConnectionsPage
      slugs={slugs}
      adding={search.new === 'connection' ? (search.tab === 'new' ? 'new' : 'org') : null}
      onAddChange={handleAddChange}
    />
  )
}
