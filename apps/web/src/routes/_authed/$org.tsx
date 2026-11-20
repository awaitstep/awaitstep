import { createFileRoute, notFound, Outlet } from '@tanstack/react-router'
import {
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

// The new dashboard (W1). Rendered in the browser only.
export const Route = createFileRoute('/_authed/$org')({
  ssr: false,
  validateSearch: validateDashboardSearch,
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
  return (
    <DashboardProviders>
      <TopBarSlotProvider>
        <DashboardShell>
          <Outlet />
        </DashboardShell>
      </TopBarSlotProvider>
    </DashboardProviders>
  )
}
