import { createFileRoute } from '@tanstack/react-router'
import { pageHead, type DashboardPage } from '../../components/navigation/dashboard-page'
import { KeysPage } from '../../components/project-settings/keys-page'

const page: DashboardPage = { kind: 'project-settings', page: 'api-keys' }

export const Route = createFileRoute('/_authed/$org/$project/settings/api-keys')({
  staticData: { dashboardPage: page },
  head: () => pageHead(page),
  component: ProjectApiKeysPage,
})

function ProjectApiKeysPage() {
  const slugs = Route.useParams()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()

  function handleCloseDialog() {
    void navigate({ search: (prev) => ({ ...prev, new: undefined }), replace: true })
  }

  return (
    <KeysPage slugs={slugs} createOpen={search.new === 'key'} onCloseCreate={handleCloseDialog} />
  )
}
