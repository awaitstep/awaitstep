import { createFileRoute } from '@tanstack/react-router'
import { pageHead, type DashboardPage } from '../../components/navigation/dashboard-page'
import { ItemPlaceholder } from '../../components/navigation/item-placeholder'

const page: DashboardPage = { kind: 'item' }

export const Route = createFileRoute('/_authed/$org/items/$itemId')({
  staticData: { dashboardPage: page },
  head: () => pageHead(page),
  validateSearch: (search: Record<string, unknown>) => ({
    run: typeof search.run === 'string' ? search.run : undefined,
    kind: search.kind === 'function' ? ('function' as const) : undefined,
  }),
  component: ItemRoute,
})

function ItemRoute() {
  const { org, itemId } = Route.useParams()
  const { run, kind } = Route.useSearch()
  return <ItemPlaceholder org={org} itemId={itemId} runId={run} kind={kind ?? 'workflow'} />
}
