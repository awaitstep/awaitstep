import { createFileRoute } from '@tanstack/react-router'
import { DashboardPage } from '../../components/orgs/dashboard-page'
import {
  DashboardProviders,
  validateDashboardSearch,
} from '../../components/navigation/dashboard-providers'

// Where sign-in lands when nothing sent you there (17a/17b): every
// organization you're in. Client-only, like the rest of the new dashboard.
export const Route = createFileRoute('/_authed/dashboard')({
  ssr: false,
  validateSearch: validateDashboardSearch,
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
    <DashboardProviders>
      <DashboardPage dialog={search.new} onCloseDialog={handleCloseDialog} />
    </DashboardProviders>
  )
}
