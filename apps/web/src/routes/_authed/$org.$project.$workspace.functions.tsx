import { createFileRoute } from '@tanstack/react-router'
import { pageHead, type DashboardPage } from '../../components/navigation/dashboard-page'
import { FunctionsPage } from '../../components/items/functions-page'

const page: DashboardPage = { kind: 'workspace', page: 'functions' }

export const Route = createFileRoute('/_authed/$org/$project/$workspace/functions')({
  staticData: { dashboardPage: page },
  head: () => pageHead(page),
  component: FunctionsRoute,
})

function FunctionsRoute() {
  const slugs = Route.useParams()
  return <FunctionsPage slugs={slugs} />
}
