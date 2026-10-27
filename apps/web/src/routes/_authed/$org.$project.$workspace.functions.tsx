import { createFileRoute } from '@tanstack/react-router'
import { pageHead, type DashboardPage } from '../../components/navigation/dashboard-page'
import { PagePlaceholder } from '../../components/navigation/page-placeholder'

const page: DashboardPage = { kind: 'workspace', page: 'functions' }

export const Route = createFileRoute('/_authed/$org/$project/$workspace/functions')({
  staticData: { dashboardPage: page },
  head: () => pageHead(page),
  component: FunctionsPage,
})

function FunctionsPage() {
  return <PagePlaceholder title="Functions" boards="WsFunctions" step="P2" />
}
