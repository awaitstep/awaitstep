import { createFileRoute, Navigate, Outlet } from '@tanstack/react-router'
import {
  DashboardProviders,
  validateDashboardSearch,
} from '../../components/navigation/dashboard-providers'
import { TopBarSlotProvider } from '../../components/navigation/top-bar-slot'
import { CurrentOrgProvider, useCurrentOrg } from '../../components/navigation/current-org'
import { OrgLessShell } from '../../components/navigation/orgless-shell'
import { useDashboardPage } from '../../components/navigation/dashboard-shell'
import { NoOrgAccountFrame } from '../../components/navigation/no-org-account-frame'
import { orgLessFrame } from '../../lib/shell-routes'

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
  const frame = orgLessFrame(org !== null, useDashboardPage()?.kind)
  if (frame === 'to-dashboard') return <Navigate to="/dashboard" replace />
  if (frame === 'entry' || !org) {
    return (
      <DashboardProviders>
        <NoOrgAccountFrame>
          <Outlet />
        </NoOrgAccountFrame>
      </DashboardProviders>
    )
  }
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
