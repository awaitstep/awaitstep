import { createFileRoute } from '@tanstack/react-router'
import { pageHead, type DashboardPage } from '../../components/navigation/dashboard-page'
import { PagePlaceholder } from '../../components/navigation/page-placeholder'

const page: DashboardPage = { kind: 'org-settings', page: 'members' }

export const Route = createFileRoute('/_authed/$org/settings/members')({
  staticData: { dashboardPage: page },
  head: () => pageHead(page),
  component: OrgMembersPage,
})

function OrgMembersPage() {
  return <PagePlaceholder title="Members" boards="OrgMembers" step="P5" />
}
