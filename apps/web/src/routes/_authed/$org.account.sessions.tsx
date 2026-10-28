import { createFileRoute } from '@tanstack/react-router'
import { pageHead, type DashboardPage } from '../../components/navigation/dashboard-page'
import { SessionsPage } from '../../components/account-pages/sessions-page'

const page: DashboardPage = { kind: 'account', page: 'sessions' }

export const Route = createFileRoute('/_authed/$org/account/sessions')({
  staticData: { dashboardPage: page },
  head: () => pageHead(page),
  component: AccountSessionsPage,
})

function AccountSessionsPage() {
  const { org } = Route.useParams()
  return <SessionsPage org={org} />
}
