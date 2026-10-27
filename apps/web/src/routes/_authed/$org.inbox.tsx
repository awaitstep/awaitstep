import { createFileRoute } from '@tanstack/react-router'
import { pageHead, type DashboardPage } from '../../components/navigation/dashboard-page'
import { PagePlaceholder } from '../../components/navigation/page-placeholder'

const page: DashboardPage = { kind: 'org', page: 'inbox' }

export const Route = createFileRoute('/_authed/$org/inbox')({
  staticData: { dashboardPage: page },
  head: () => pageHead(page),
  component: InboxPage,
})

function InboxPage() {
  return <PagePlaceholder title="Inbox" boards="Notifications" step="P8" />
}
