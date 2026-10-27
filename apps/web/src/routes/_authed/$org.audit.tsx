import { createFileRoute } from '@tanstack/react-router'
import { pageHead, type DashboardPage } from '../../components/navigation/dashboard-page'
import { PagePlaceholder } from '../../components/navigation/page-placeholder'

const page: DashboardPage = { kind: 'org', page: 'audit' }

export const Route = createFileRoute('/_authed/$org/audit')({
  staticData: { dashboardPage: page },
  head: () => pageHead(page),
  component: AuditLogPage,
})

function AuditLogPage() {
  return <PagePlaceholder title="Audit log" boards="AuditLog" step="P7" />
}
