import { createFileRoute, retainSearchParams } from '@tanstack/react-router'
import { ChooseOrgPage } from '../../components/orgs/choose-org-page'
import {
  DASHBOARD_SEARCH_KEYS,
  DashboardProviders,
  validateDashboardSearch,
} from '../../components/navigation/dashboard-providers'

export const Route = createFileRoute('/_authed/choose-org')({
  ssr: false,
  validateSearch: validateDashboardSearch,
  // Keeps the dummy session (?as=, ?mock=) between choose-org and invites, as $org does.
  search: { middlewares: [retainSearchParams([...DASHBOARD_SEARCH_KEYS])] },
  head: () => ({ meta: [{ title: 'Choose an organization · AwaitStep' }] }),
  component: ChooseOrgRoute,
})

function ChooseOrgRoute() {
  const search = Route.useSearch()
  return (
    <DashboardProviders search={search}>
      <ChooseOrgPage />
    </DashboardProviders>
  )
}
