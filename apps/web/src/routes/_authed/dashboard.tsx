import { createFileRoute, retainSearchParams } from '@tanstack/react-router'
import { DashboardPage } from '../../components/orgs/dashboard-page'
import {
  DASHBOARD_SEARCH_KEYS,
  DashboardProviders,
  validateDashboardSearch,
} from '../../components/navigation/dashboard-providers'

// Where sign-in lands when nothing sent you there (17a/17b): every
// organization you're in. Client-only, like the rest of the new dashboard.
export const Route = createFileRoute('/_authed/dashboard')({
  ssr: false,
  validateSearch: validateDashboardSearch,
  // Keeps the dummy session (?as=, ?mock=) between /dashboard and invites, as $org does.
  search: { middlewares: [retainSearchParams([...DASHBOARD_SEARCH_KEYS])] },
  head: () => ({ meta: [{ title: 'Your organizations · AwaitStep' }] }),
  component: DashboardRoute,
})

function DashboardRoute() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()

  function handleCloseDialog() {
    void navigate({ search: (prev) => ({ ...prev, new: undefined }), replace: true })
  }

  return (
    <DashboardProviders search={search}>
      <DashboardPage dialog={search.new} onCloseDialog={handleCloseDialog} />
    </DashboardProviders>
  )
}
