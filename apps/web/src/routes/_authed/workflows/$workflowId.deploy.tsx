import { createFileRoute } from '@tanstack/react-router'
import { LegacyItemRedirect } from '../../../components/navigation/legacy-item-redirect'
import { parseDeploySearch } from '../../../lib/workflows/deploy-search'

// Legacy URL: Deploy now lives at the workflow's workspace URL (`?version=` kept).
export const Route = createFileRoute('/_authed/workflows/$workflowId/deploy')({
  validateSearch: parseDeploySearch,
  component: LegacyDeploy,
})

function LegacyDeploy() {
  const { workflowId } = Route.useParams()
  const { version } = Route.useSearch()
  return <LegacyItemRedirect workflowId={workflowId} page={{ kind: 'deploy', version }} />
}
