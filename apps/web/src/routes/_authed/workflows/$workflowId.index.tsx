import { createFileRoute } from '@tanstack/react-router'
import { LegacyItemRedirect } from '../../../components/navigation/legacy-item-redirect'
import { LegacyRedirect } from '../../../components/navigation/legacy-redirect'

// Legacy URL: a workflow's Overview now lives at its workspace URL.
export const Route = createFileRoute('/_authed/workflows/$workflowId/')({
  component: LegacyOverview,
})

function LegacyOverview() {
  const { workflowId } = Route.useParams()
  // The old unsaved `/workflows/new`: workflows are created from a workspace now.
  if (workflowId === 'new') return <LegacyRedirect page="workflows" />
  return <LegacyItemRedirect workflowId={workflowId} page={{ kind: 'overview' }} />
}
