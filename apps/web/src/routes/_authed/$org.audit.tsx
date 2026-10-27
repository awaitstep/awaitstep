import { createFileRoute } from '@tanstack/react-router'
import { AuditLogPage } from '../../components/audit/audit-log-page'
import { pageHead, type DashboardPage } from '../../components/navigation/dashboard-page'

const page: DashboardPage = { kind: 'org', page: 'audit' }

export const Route = createFileRoute('/_authed/$org/audit')({
  staticData: { dashboardPage: page },
  head: () => pageHead(page),
  component: OrgAuditPage,
})

function OrgAuditPage() {
  const { org } = Route.useParams()
  return <AuditLogPage org={org} />
}
