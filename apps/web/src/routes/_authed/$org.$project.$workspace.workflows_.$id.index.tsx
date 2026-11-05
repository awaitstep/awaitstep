import { createFileRoute } from '@tanstack/react-router'
import { pageHead, type DashboardPage } from '../../components/navigation/dashboard-page'
import { ScopedWorkflowEditor } from '../../components/workflows/scoped-workflow-editor'
import { getCanvasContext } from '../../lib/workflows/canvas-context'
import { parseEditorSearch } from '../../lib/workflows/surfaces'

const page: DashboardPage = { kind: 'editor' }

// The item's editor, full screen. Canvas and Code switch `view` in place
// (see useSwitchView), which stays on this route.
export const Route = createFileRoute('/_authed/$org/$project/$workspace/workflows_/$id/')({
  staticData: { dashboardPage: page },
  head: () => pageHead(page),
  validateSearch: parseEditorSearch,
  loader: () => getCanvasContext(),
  // The flag is fixed for the server's lifetime; a view switch must not refetch it.
  staleTime: Infinity,
  component: WorkflowEditorRoute,
})

function WorkflowEditorRoute() {
  const { id, ...slugs } = Route.useParams()
  const search = Route.useSearch()
  const { localDev } = Route.useLoaderData()
  return <ScopedWorkflowEditor slugs={slugs} workflowId={id} search={search} localDev={localDev} />
}
