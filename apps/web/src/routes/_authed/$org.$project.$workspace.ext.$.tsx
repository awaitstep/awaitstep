import { createFileRoute } from '@tanstack/react-router'
import type { DashboardPage } from '../../components/navigation/dashboard-page'
import { extensionPageHead, ExtensionWorkspacePage } from '../../extensions/extension-pages'

const page: DashboardPage = { kind: 'extension', scope: 'workspace' }

// An extension's page in a workspace: /{org}/{project}/{workspace}/ext/{id}/{path}.
export const Route = createFileRoute('/_authed/$org/$project/$workspace/ext/$')({
  staticData: { dashboardPage: page },
  head: ({ params, matches }) => extensionPageHead('workspace', params._splat, matches),
  component: ExtensionWorkspaceRoute,
})

function ExtensionWorkspaceRoute() {
  const { _splat, ...slugs } = Route.useParams()
  return <ExtensionWorkspacePage slugs={slugs} splat={_splat} />
}
