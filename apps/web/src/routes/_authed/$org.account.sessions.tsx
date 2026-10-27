import { createFileRoute } from '@tanstack/react-router'
import { pageHead, type DashboardPage } from '../../components/navigation/dashboard-page'
import { PagePlaceholder } from '../../components/navigation/page-placeholder'

const page: DashboardPage = { kind: 'account', page: 'sessions' }

export const Route = createFileRoute('/_authed/$org/account/sessions')({
  staticData: { dashboardPage: page },
  head: () => pageHead(page),
  component: AccountSessionsPage,
})

function AccountSessionsPage() {
  return <PagePlaceholder title="Sessions and sign-in" boards="AccountSessions" step="P10" />
}
