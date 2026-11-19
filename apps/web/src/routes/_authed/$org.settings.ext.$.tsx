import { createFileRoute } from '@tanstack/react-router'
import type { DashboardPage } from '../../components/navigation/dashboard-page'
import { extensionPageHead, ExtensionSettingsPage } from '../../extensions/extension-pages'

const page: DashboardPage = { kind: 'extension', scope: 'org-settings' }

// An extension's tab in Org Settings: /{org}/settings/ext/{id}/{path}.
export const Route = createFileRoute('/_authed/$org/settings/ext/$')({
  staticData: { dashboardPage: page },
  head: ({ params, matches }) => extensionPageHead('org-settings', params._splat, matches),
  component: ExtensionSettingsRoute,
})

function ExtensionSettingsRoute() {
  const { org, _splat } = Route.useParams()
  return <ExtensionSettingsPage org={org} splat={_splat} />
}
