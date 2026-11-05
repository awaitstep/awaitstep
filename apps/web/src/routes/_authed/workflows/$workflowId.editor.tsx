import { createFileRoute } from '@tanstack/react-router'
import { LegacyItemRedirect } from '../../../components/navigation/legacy-item-redirect'
import { LegacyRedirect } from '../../../components/navigation/legacy-redirect'
import { parseEditorSearch } from '../../../lib/workflows/surfaces'

// Legacy URL: the editor now opens at the workflow's workspace URL, with the
// same `?view=` / `?version=` / `?file=`.
export const Route = createFileRoute('/_authed/workflows/$workflowId/editor')({
  validateSearch: parseEditorSearch,
  component: LegacyEditor,
})

function LegacyEditor() {
  const { workflowId } = Route.useParams()
  const search = Route.useSearch()
  // The old unsaved `/workflows/new`: workflows are created from a workspace now.
  if (workflowId === 'new') return <LegacyRedirect page="workflows" />
  return <LegacyItemRedirect workflowId={workflowId} page={{ kind: 'editor', search }} />
}
