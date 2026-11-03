import { createFileRoute } from '@tanstack/react-router'
import { pageHead, type DashboardPage } from '../../components/navigation/dashboard-page'
import { SessionsPage } from '../../components/account-pages/sessions-page'

const page: DashboardPage = { kind: 'account', page: 'sessions' }

export const Route = createFileRoute('/_authed/_orgless/account/sessions')({
  // better-auth sends a refused Connect back here with `?error=<code>`.
  validateSearch: (search: Record<string, unknown>): { error?: string } =>
    typeof search.error === 'string' ? { error: search.error } : {},
  staticData: { dashboardPage: page },
  head: () => pageHead(page),
  component: AccountSessionsPage,
})

function AccountSessionsPage() {
  const { error } = Route.useSearch()
  return <SessionsPage linkError={error} />
}
