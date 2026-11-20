import { createFileRoute } from '@tanstack/react-router'
import {
  DashboardProviders,
  validateDashboardSearch,
} from '../components/navigation/dashboard-providers'
import { InvitePage } from '../components/invites/invite-page'

// Public: whoever opens an invite may not be signed in yet.
export const Route = createFileRoute('/invite/$token')({
  ssr: false,
  validateSearch: validateDashboardSearch,
  head: () => ({ meta: [{ title: 'Invitation · AwaitStep' }] }),
  component: InviteRoute,
})

function InviteRoute() {
  const { token } = Route.useParams()
  return (
    <DashboardProviders>
      <InvitePage token={token} />
    </DashboardProviders>
  )
}
