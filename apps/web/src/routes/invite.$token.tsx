import { createFileRoute } from '@tanstack/react-router'
import {
  DashboardProviders,
  validateDashboardSearch,
} from '../components/navigation/dashboard-providers'
import { PagePlaceholder } from '../components/navigation/page-placeholder'

// Public: whoever opens an invite may not be signed in yet.
export const Route = createFileRoute('/invite/$token')({
  ssr: false,
  validateSearch: validateDashboardSearch,
  head: () => ({ meta: [{ title: 'Invitation · AwaitStep' }] }),
  component: InvitePage,
})

function InvitePage() {
  const search = Route.useSearch()
  return (
    <DashboardProviders search={search}>
      <PagePlaceholder
        title="You’re invited"
        boards="AcceptInvite, InviteWrongAccount and InviteExpired"
        step="P9"
      />
    </DashboardProviders>
  )
}
