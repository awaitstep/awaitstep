import { createFileRoute } from '@tanstack/react-router'
import { pageHead, type DashboardPage } from '../../components/navigation/dashboard-page'
import { openEditorScope } from '../../components/workflows/editor-route'
import {
  EditorScopeError,
  ScopedWorkflowEditor,
} from '../../components/workflows/scoped-workflow-editor'
import { getCanvasContext } from '../../lib/workflows/canvas-context'
import { leaveRouteScope } from '../../lib/workflows/route-scope'
import { parseEditorSearch } from '../../lib/workflows/surfaces'

const page: DashboardPage = { kind: 'editor' }

// A workflow or function, opened in its workspace: the editor, full screen.
// Canvas and Code switch `view` in place (see useSwitchView), which stays on
// this route; leaving it hands API calls back to the old switcher's project.
export const Route = createFileRoute('/_authed/$org/$project/$workspace/workflows_/$id')({
  staticData: { dashboardPage: page },
  head: () => pageHead(page),
  validateSearch: parseEditorSearch,
  beforeLoad: ({ params, search, preload, abortController }) =>
    openEditorScope({ params, search, preload, signal: abortController.signal }),
  onLeave: leaveRouteScope,
  loader: () => getCanvasContext(),
  // The flag is fixed for the server's lifetime; a view switch must not refetch it.
  staleTime: Infinity,
  component: WorkflowEditorRoute,
  errorComponent: EditorScopeError,
})

function WorkflowEditorRoute() {
  const { id, ...slugs } = Route.useParams()
  const search = Route.useSearch()
  const { localDev } = Route.useLoaderData()
  return <ScopedWorkflowEditor slugs={slugs} workflowId={id} search={search} localDev={localDev} />
}
