import { createFileRoute, useParams } from '@tanstack/react-router'
import { DeploymentsPanel } from '../../../components/workflow-detail/deployments-panel'
import { useOrgReady } from '../../../stores/org-store'

export const Route = createFileRoute('/_authed/workflows/$workflowId/deployments')({
  head: () => ({ meta: [{ title: 'Deployments | AwaitStep' }] }),
  component: DeploymentsPage,
})

function DeploymentsPage() {
  const { workflowId } = useParams({ from: '/_authed/workflows/$workflowId/deployments' })
  const ready = useOrgReady()
  return <DeploymentsPanel workflowId={workflowId} ready={ready} />
}
