import { createFileRoute } from '@tanstack/react-router'
import { WorkflowEditor } from '../../../components/workflows/workflow-editor'
import { getCanvasContext } from '../../../lib/workflows/canvas-context'
import { parseEditorSearch } from '../../../lib/workflows/surfaces'

// Canvas and Code are one editor: switching views changes `view` in place
// (a replace navigation), so this route stays mounted and history gains no
// entry. See useSwitchView.
export const Route = createFileRoute('/_authed/workflows/$workflowId/editor')({
  head: () => ({ meta: [{ title: 'Editor | AwaitStep' }] }),
  component: EditorPage,
  loader: () => getCanvasContext(),
  // The flag is fixed for the server's lifetime; a view switch must not refetch it.
  staleTime: Infinity,
  validateSearch: parseEditorSearch,
})

function EditorPage() {
  const { workflowId } = Route.useParams()
  const search = Route.useSearch()
  const { localDev } = Route.useLoaderData()
  return <WorkflowEditor workflowId={workflowId} search={search} localDev={localDev} />
}
