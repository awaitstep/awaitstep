import { createFileRoute } from '@tanstack/react-router'
import { pageHead, type DashboardPage } from '../../components/navigation/dashboard-page'
import { GeneralPage } from '../../components/project-settings/general-page'

const page: DashboardPage = { kind: 'project', page: 'settings' }

export const Route = createFileRoute('/_authed/$org/$project/settings/')({
  staticData: { dashboardPage: page },
  head: () => pageHead(page),
  component: ProjectGeneralPage,
})

function ProjectGeneralPage() {
  const slugs = Route.useParams()
  return <GeneralPage slugs={slugs} />
}
