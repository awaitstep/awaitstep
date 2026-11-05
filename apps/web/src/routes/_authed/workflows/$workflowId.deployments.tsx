import { createFileRoute } from '@tanstack/react-router'
import { LegacyItemRedirect } from '../../../components/navigation/legacy-item-redirect'

// Legacy URL: Deployments now lives at the workflow's workspace URL.
export const Route = createFileRoute('/_authed/workflows/$workflowId/deployments')({
  component: LegacyDeployments,
})

function LegacyDeployments() {
  const { workflowId } = Route.useParams()
  return <LegacyItemRedirect workflowId={workflowId} page={{ kind: 'deployments' }} />
}
