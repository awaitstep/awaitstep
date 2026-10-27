import { createFileRoute } from '@tanstack/react-router'
import { pageHead, type DashboardPage } from '../../components/navigation/dashboard-page'
import { SharedLibraryPage } from '../../components/project-settings/shared-library-page'

const page: DashboardPage = { kind: 'project-settings', page: 'shared' }

export const Route = createFileRoute('/_authed/$org/$project/settings/shared')({
  staticData: { dashboardPage: page },
  head: () => pageHead(page),
  component: ProjectSharedLibraryPage,
})

function ProjectSharedLibraryPage() {
  const slugs = Route.useParams()
  return <SharedLibraryPage slugs={slugs} />
}
