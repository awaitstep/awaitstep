import { createFileRoute, Navigate, Outlet } from '@tanstack/react-router'
import {
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
  component: OrgLessLayout,
})

function OrgLessLayout() {
  const org = useCurrentOrg()
  // With no organization at all there is no rail to borrow: /dashboard offers to make one.
  if (!org) return <Navigate to="/dashboard" replace />
  return (
    <DashboardProviders>
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
