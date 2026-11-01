import { createFileRoute } from '@tanstack/react-router'
import { pageHead, type DashboardPage } from '../../components/navigation/dashboard-page'
import { OrgKeysPage } from '../../components/org-settings/org-keys-page'

const page: DashboardPage = { kind: 'org', page: 'api-keys' }

export const Route = createFileRoute('/_authed/$org/api-keys')({
  staticData: { dashboardPage: page },
  head: () => pageHead(page),
  component: OrgApiKeysPage,
})

function OrgApiKeysPage() {
  const { org } = Route.useParams()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()

  function handleCloseDialog() {
    void navigate({ search: (prev) => ({ ...prev, new: undefined }), replace: true })
  }

  return (
    <OrgKeysPage org={org} createOpen={search.new === 'key'} onCloseCreate={handleCloseDialog} />
  )
}
