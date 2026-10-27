import { createFileRoute } from '@tanstack/react-router'
import { pageHead, type DashboardPage } from '../../components/navigation/dashboard-page'
import { OrgHomePage } from '../../components/projects/org-home-page'

const page: DashboardPage = { kind: 'org', page: 'projects' }

export const Route = createFileRoute('/_authed/$org/projects')({
  staticData: { dashboardPage: page },
  head: () => pageHead(page),
  component: ProjectsPage,
})

function ProjectsPage() {
  const { org } = Route.useParams()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()

  function handleCloseDialog() {
    void navigate({
      search: (prev) => ({ ...prev, new: undefined, then: undefined }),
      replace: true,
    })
  }

  return (
    <OrgHomePage
      org={org}
      dialog={search.new}
      then={search.then}
      onCloseDialog={handleCloseDialog}
    />
  )
}
