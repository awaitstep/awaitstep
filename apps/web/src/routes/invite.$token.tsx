import { createFileRoute, retainSearchParams } from '@tanstack/react-router'
import {
  DASHBOARD_SEARCH_KEYS,
  DashboardProviders,
  validateDashboardSearch,
} from '../components/navigation/dashboard-providers'
import { InvitePage } from '../components/invites/invite-page'

// Public: whoever opens an invite may not be signed in yet.
export const Route = createFileRoute('/invite/$token')({
  ssr: false,
  validateSearch: validateDashboardSearch,
  // Keeps the dummy session (?as=, ?mock=) between choose-org and invites, as $org does.
  search: { middlewares: [retainSearchParams([...DASHBOARD_SEARCH_KEYS])] },
  head: () => ({ meta: [{ title: 'Invitation · AwaitStep' }] }),
  component: InviteRoute,
})

function InviteRoute() {
  const { token } = Route.useParams()
  const search = Route.useSearch()
  return (
    <DashboardProviders search={search}>
      <InvitePage token={token} />
    </DashboardProviders>
  )
}
