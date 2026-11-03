import { createFileRoute, Navigate, Outlet, retainSearchParams } from '@tanstack/react-router'
import {
  DASHBOARD_SEARCH_KEYS,
  DashboardProviders,
  validateDashboardSearch,
} from '../../components/navigation/dashboard-providers'
import { TopBarSlotProvider } from '../../components/navigation/top-bar-slot'
import { CurrentOrgProvider, useCurrentOrg } from '../../components/navigation/current-org'
import { OrgLessShell } from '../../components/navigation/orgless-shell'

// Top-level pages that belong to you or your API key, not to an organization:
// your account and the API Playground. They carry no org in the URL, but reuse
// the new dashboard's rail — framed by your current org. Rendered in the
// browser only, like the rest of the dashboard (the current org comes from
// client-side memory and the org store).
export const Route = createFileRoute('/_authed/_orgless')({
  ssr: false,
  validateSearch: validateDashboardSearch,
  search: { middlewares: [retainSearchParams([...DASHBOARD_SEARCH_KEYS])] },
  component: OrgLessLayout,
})

function OrgLessLayout() {
  const search = Route.useSearch()
  const org = useCurrentOrg()
  // With no organization at all there is no rail to borrow: /dashboard offers to make one.
  if (!org) return <Navigate to="/dashboard" replace />
  return (
    <DashboardProviders search={search}>
      <TopBarSlotProvider>
        <CurrentOrgProvider value={org}>
          <OrgLessShell>
            <Outlet />
          </OrgLessShell>
        </CurrentOrgProvider>
      </TopBarSlotProvider>
    </DashboardProviders>
  )
}
