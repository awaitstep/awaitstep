import { createFileRoute } from '@tanstack/react-router'
import { pageHead, type DashboardPage } from '../../components/navigation/dashboard-page'
import { PagePlaceholder } from '../../components/navigation/page-placeholder'

const page: DashboardPage = { kind: 'account', page: 'profile' }

export const Route = createFileRoute('/_authed/$org/account/profile')({
  staticData: { dashboardPage: page },
  head: () => pageHead(page),
  component: AccountProfilePage,
})

function AccountProfilePage() {
  return <PagePlaceholder title="Profile" boards="AccountProfile" step="P10" />
}
