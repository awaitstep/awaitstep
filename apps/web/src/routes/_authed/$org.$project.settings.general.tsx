import { createFileRoute } from '@tanstack/react-router'
import { pageHead, type DashboardPage } from '../../components/navigation/dashboard-page'
import { PagePlaceholder } from '../../components/navigation/page-placeholder'

const page: DashboardPage = { kind: 'project-settings', page: 'general' }

export const Route = createFileRoute('/_authed/$org/$project/settings/general')({
  staticData: { dashboardPage: page },
  head: () => pageHead(page),
  component: ProjectGeneralPage,
})

function ProjectGeneralPage() {
  return <PagePlaceholder title="General" boards="ProjectGeneral" step="P3" />
}
