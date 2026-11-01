import { createFileRoute } from '@tanstack/react-router'
import { pageHead, type DashboardPage } from '../../components/navigation/dashboard-page'
import { MembersPage } from '../../components/project-settings/members-page'

const page: DashboardPage = { kind: 'project-settings', page: 'members' }

export const Route = createFileRoute('/_authed/$org/$project/settings/members')({
  staticData: { dashboardPage: page },
  head: () => pageHead(page),
  component: ProjectMembersPage,
})

/** `?access=add` opens Add people on the page, set to this project. */
function ProjectMembersPage() {
  const slugs = Route.useParams()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()

  function handleCloseAdd() {
    void navigate({ search: (prev) => ({ ...prev, access: undefined }), replace: true })
  }

  return <MembersPage slugs={slugs} adding={search.access === 'add'} onCloseAdd={handleCloseAdd} />
}
