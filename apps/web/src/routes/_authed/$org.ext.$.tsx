import { createFileRoute } from '@tanstack/react-router'
import type { DashboardPage } from '../../components/navigation/dashboard-page'
import { extensionPageHead, ExtensionOrgPage } from '../../extensions/extension-pages'

const page: DashboardPage = { kind: 'extension', scope: 'org' }

// An extension's org-level page, reached from the rail: /{org}/ext/{id}/{path}.
export const Route = createFileRoute('/_authed/$org/ext/$')({
  staticData: { dashboardPage: page },
  head: ({ params, matches }) => extensionPageHead('org', params._splat, matches),
  component: ExtensionOrgRoute,
})

function ExtensionOrgRoute() {
  const { org, _splat } = Route.useParams()
  return <ExtensionOrgPage org={org} splat={_splat} />
}
