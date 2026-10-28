import { createFileRoute, notFound, Outlet, retainSearchParams } from '@tanstack/react-router'
import {
  DASHBOARD_SEARCH_KEYS,
  DashboardProviders,
  validateDashboardSearch,
} from '../../components/navigation/dashboard-providers'
import { isReservedSlug } from '../../lib/dashboard-paths'
import { DashboardShell, PageNotFound } from '../../components/navigation/dashboard-shell'
import { rememberOrg } from '../../components/navigation/scope-memory'
import { TopBarSlotProvider } from '../../components/navigation/top-bar-slot'

function remember({ params }: { params: { org: string } }) {
  rememberOrg(params.org)
}

// The new dashboard (W1). Rendered in the browser only: its dummy data lives
// in sessionStorage, which a server render can't see.
export const Route = createFileRoute('/_authed/$org')({
  ssr: false,
  validateSearch: validateDashboardSearch,
  search: { middlewares: [retainSearchParams([...DASHBOARD_SEARCH_KEYS])] },
  // A reserved slug is never an org: `/dashboard/foo` is a mistyped old-app
  // URL, so it gets the app's 404, not the dashboard's "no such organization".
  beforeLoad: ({ params }) => {
    if (isReservedSlug('org', params.org)) throw notFound()
  },
  // Entering an org makes it the one sign-in and the old URLs land in next time.
  onEnter: remember,
  onStay: remember,
  component: DashboardLayout,
  notFoundComponent: PageNotFound,
})

function DashboardLayout() {
  const search = Route.useSearch()
  return (
    <DashboardProviders search={search}>
      <TopBarSlotProvider>
        <DashboardShell>
          <Outlet />
        </DashboardShell>
      </TopBarSlotProvider>
    </DashboardProviders>
  )
}
