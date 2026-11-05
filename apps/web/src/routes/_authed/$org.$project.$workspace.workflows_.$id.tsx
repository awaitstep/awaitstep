import { createFileRoute } from '@tanstack/react-router'
import { openEditorScope } from '../../components/workflows/editor-route'
import { EditorScopeError } from '../../components/workflows/scoped-workflow-editor'
import { ItemScopeLayout } from '../../components/workflow-detail/item-scope-layout'

// A workflow or function, opened in its workspace: the editor and its own
// pages (Overview, Runs, Deployments, Deploy). The ids its URL names reach
// every call under it as route context, never through the org store.
export const Route = createFileRoute('/_authed/$org/$project/$workspace/workflows_/$id')({
  beforeLoad: ({ params, search }) => openEditorScope({ params, search }),
  component: ItemScopeRoute,
  errorComponent: EditorScopeError,
})

function ItemScopeRoute() {
  const { org, project, workspace } = Route.useParams()
  const { itemScope } = Route.useRouteContext()
  return <ItemScopeLayout org={org} project={project} workspace={workspace} scope={itemScope} />
}
