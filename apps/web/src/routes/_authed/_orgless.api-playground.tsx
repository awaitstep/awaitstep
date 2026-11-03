import { createFileRoute } from '@tanstack/react-router'
import { pageHead, type DashboardPage } from '../../components/navigation/dashboard-page'
import { ApiPlaygroundPanel } from '../../components/playground/api-playground-panel'

const page: DashboardPage = { kind: 'playground' }

export const Route = createFileRoute('/_authed/_orgless/api-playground')({
  staticData: { dashboardPage: page },
  head: () => pageHead(page),
  component: ApiPlaygroundPanel,
})
