import { createFileRoute } from '@tanstack/react-router'
import { DashboardStats } from '../../components/dashboard/dashboard-stats'
import { WorkflowList } from '../../components/dashboard/workflow-list'
import { RecentRunsList } from '../../components/dashboard/recent-runs-list'
import { OnboardingOverlay } from '../../components/dashboard/onboarding-overlay'
import { RequireProject } from '../../wrappers/require-project'
import { PageHeader } from '../../components/ui/page-header'

export const Route = createFileRoute('/_authed/dashboard')({
  head: () => ({ meta: [{ title: 'Dashboard | AwaitStep' }] }),
  component: DashboardPage,
})

function DashboardPage() {
  return (
    <RequireProject>
      <PageHeader title="Dashboard" breadcrumbs={[{ label: 'Home' }]} />
      <DashboardStats />
      <WorkflowList />
      <RecentRunsList />
      <OnboardingOverlay />
    </RequireProject>
  )
}
