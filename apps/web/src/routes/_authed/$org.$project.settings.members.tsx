import { createFileRoute } from '@tanstack/react-router'
import { pageHead, type DashboardPage } from '../../components/navigation/dashboard-page'
import { MembersPage } from '../../components/project-settings/members-page'

const page: DashboardPage = { kind: 'project-settings', page: 'members' }

export const Route = createFileRoute('/_authed/$org/$project/settings/members')({
  staticData: { dashboardPage: page },
  head: () => pageHead(page),
  component: ProjectMembersPage,
})

function ProjectMembersPage() {
  const slugs = Route.useParams()
  return <MembersPage slugs={slugs} />
}
