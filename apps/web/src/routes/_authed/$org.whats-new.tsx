import { createFileRoute } from '@tanstack/react-router'
import { pageHead, type DashboardPage } from '../../components/navigation/dashboard-page'
import { PagePlaceholder } from '../../components/navigation/page-placeholder'

const page: DashboardPage = { kind: 'org', page: 'whats-new' }

export const Route = createFileRoute('/_authed/$org/whats-new')({
  staticData: { dashboardPage: page },
  head: () => pageHead(page),
  component: WhatsNewPage,
})

function WhatsNewPage() {
  return <PagePlaceholder title="What’s new" boards="WhatsNew" step="P8" />
}
