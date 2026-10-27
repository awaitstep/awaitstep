import { createFileRoute } from '@tanstack/react-router'
import { ChooseOrgEntry } from '../../components/navigation/choose-org-entry'
import {
  DashboardProviders,
  validateDashboardSearch,
} from '../../components/navigation/dashboard-providers'

export const Route = createFileRoute('/_authed/choose-org')({
  ssr: false,
  validateSearch: validateDashboardSearch,
  head: () => ({ meta: [{ title: 'Choose an organization · AwaitStep' }] }),
  component: ChooseOrgPage,
})

function ChooseOrgPage() {
  const search = Route.useSearch()
  return (
    <DashboardProviders search={search}>
      <ChooseOrgEntry />
    </DashboardProviders>
  )
}
