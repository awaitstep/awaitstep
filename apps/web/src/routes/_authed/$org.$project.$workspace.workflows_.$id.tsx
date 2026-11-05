import { createFileRoute } from '@tanstack/react-router'
import { openEditorScope } from '../../components/workflows/editor-route'
import { EditorScopeError } from '../../components/workflows/scoped-workflow-editor'
import { ItemScopeLayout } from '../../components/workflow-detail/item-scope-layout'
import { leaveRouteScope } from '../../lib/workflows/route-scope'

// A workflow or function, opened in its workspace: the editor and its own
// pages (Overview, Runs, Deployments, Deploy). They share this route, so
// moving between them keeps API calls on the URL's project — TanStack fires
// `onLeave` per route id, and this one stays matched until you leave the item.
export const Route = createFileRoute('/_authed/$org/$project/$workspace/workflows_/$id')({
  beforeLoad: ({ params, search, preload, abortController }) =>
    openEditorScope({ params, search, preload, signal: abortController.signal }),
  onLeave: leaveRouteScope,
  component: ItemScopeRoute,
  errorComponent: EditorScopeError,
})

function ItemScopeRoute() {
  const { org, project, workspace } = Route.useParams()
  return <ItemScopeLayout org={org} project={project} workspace={workspace} />
}
