import { createFileRoute } from '@tanstack/react-router'
import { pageHead, type DashboardPage } from '../../components/navigation/dashboard-page'
import { PagePlaceholder } from '../../components/navigation/page-placeholder'

const page: DashboardPage = { kind: 'project-settings', page: 'shared' }

export const Route = createFileRoute('/_authed/$org/$project/settings/shared')({
  staticData: { dashboardPage: page },
  head: () => pageHead(page),
  component: ProjectSharedLibraryPage,
})

function ProjectSharedLibraryPage() {
  return <PagePlaceholder title="Shared library" boards="ProjectShared" step="P3" />
}
