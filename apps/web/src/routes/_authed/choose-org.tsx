import { createFileRoute } from '@tanstack/react-router'
import { ChooseOrgPage } from '../../components/orgs/choose-org-page'
import {
  DashboardProviders,
  validateDashboardSearch,
} from '../../components/navigation/dashboard-providers'

export const Route = createFileRoute('/_authed/choose-org')({
  ssr: false,
  validateSearch: validateDashboardSearch,
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
