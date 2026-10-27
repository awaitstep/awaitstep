import { createFileRoute } from '@tanstack/react-router'
import { pageHead, type DashboardPage } from '../../components/navigation/dashboard-page'
import { PagePlaceholder } from '../../components/navigation/page-placeholder'

const page: DashboardPage = { kind: 'workspace', page: 'workflows' }

export const Route = createFileRoute('/_authed/$org/$project/$workspace/workflows')({
  staticData: { dashboardPage: page },
  head: () => pageHead(page),
  component: WorkflowsPage,
})

function WorkflowsPage() {
  return <PagePlaceholder title="Workflows" boards="Workflows and ViewerWorkflows" step="P2" />
}
