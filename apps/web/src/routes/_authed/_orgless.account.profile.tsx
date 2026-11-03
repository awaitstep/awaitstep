import { createFileRoute } from '@tanstack/react-router'
import { pageHead, type DashboardPage } from '../../components/navigation/dashboard-page'
import { useBorrowedOrg } from '../../components/navigation/current-org'
import { ProfilePage } from '../../components/account-pages/profile-page'

const page: DashboardPage = { kind: 'account', page: 'profile' }

export const Route = createFileRoute('/_authed/_orgless/account/profile')({
  staticData: { dashboardPage: page },
  head: () => pageHead(page),
  component: AccountProfilePage,
})

function AccountProfilePage() {
  const org = useBorrowedOrg()
  return <ProfilePage currentOrg={org.slug} />
}
