import { createFileRoute } from '@tanstack/react-router'
import { DashboardStats } from '../../components/dashboard/dashboard-stats'
import { WorkflowList } from '../../components/dashboard/workflow-list'
import { RecentRunsList } from '../../components/dashboard/recent-runs-list'
import { OnboardingOverlay } from '../../components/dashboard/onboarding-overlay'
import { RequireProject } from '../../wrappers/require-project'

export const Route = createFileRoute('/_authed/dashboard')({
  component: DashboardPage,
})

function DashboardPage() {
  return (
    <RequireProject>
      <h1 className="border-b border-border pb-4 text-lg font-semibold">Dashboard</h1>
      <DashboardStats />
      <WorkflowList />
      <RecentRunsList />
      <OnboardingOverlay />
    </RequireProject>
  )
}
