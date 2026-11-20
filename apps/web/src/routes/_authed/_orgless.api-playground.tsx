import { createFileRoute } from '@tanstack/react-router'
import { disabledIn } from '../../lib/feature-switches'
import { pageHead, type DashboardPage } from '../../components/navigation/dashboard-page'
import { ApiPlaygroundPanel } from '../../components/playground/api-playground-panel'

const page: DashboardPage = { kind: 'playground' }

export const Route = createFileRoute('/_authed/_orgless/api-playground')({
  staticData: { dashboardPage: page },
  head: ({ matches }) => pageHead(page, disabledIn(matches)),
  component: ApiPlaygroundPanel,
})
