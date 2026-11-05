import { createFileRoute } from '@tanstack/react-router'
import { LegacyItemRedirect } from '../../../components/navigation/legacy-item-redirect'

// Legacy URL: a workflow's Runs now lives at its workspace URL.
export const Route = createFileRoute('/_authed/workflows/$workflowId/runs/')({
  component: LegacyRuns,
})

function LegacyRuns() {
  const { workflowId } = Route.useParams()
  return <LegacyItemRedirect workflowId={workflowId} page={{ kind: 'runs' }} />
}
