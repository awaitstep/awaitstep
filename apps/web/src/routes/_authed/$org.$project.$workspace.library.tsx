import { createFileRoute } from '@tanstack/react-router'
import { pageHead, type DashboardPage } from '../../components/navigation/dashboard-page'
import { PagePlaceholder } from '../../components/navigation/page-placeholder'

const page: DashboardPage = { kind: 'workspace', page: 'library' }

export const Route = createFileRoute('/_authed/$org/$project/$workspace/library')({
  staticData: { dashboardPage: page },
  head: () => pageHead(page),
  component: LibraryPage,
})

function LibraryPage() {
  return <PagePlaceholder title="Library" boards="WsLibrary" step="P2" />
}
