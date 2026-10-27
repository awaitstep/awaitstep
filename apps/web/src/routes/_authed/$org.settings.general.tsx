import { createFileRoute } from '@tanstack/react-router'
import { pageHead, type DashboardPage } from '../../components/navigation/dashboard-page'
import { PagePlaceholder } from '../../components/navigation/page-placeholder'

const page: DashboardPage = { kind: 'org-settings', page: 'general' }

export const Route = createFileRoute('/_authed/$org/settings/general')({
  staticData: { dashboardPage: page },
  head: () => pageHead(page),
  component: OrgGeneralPage,
})

function OrgGeneralPage() {
  return <PagePlaceholder title="General" boards="OrgGeneral" step="P5" />
}
