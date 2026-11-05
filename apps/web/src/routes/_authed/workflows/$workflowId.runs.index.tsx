import { createFileRoute, useParams } from '@tanstack/react-router'
import { RunsPanel } from '../../../components/workflow-detail/runs-panel'
import { useOrgReady } from '../../../stores/org-store'

export const Route = createFileRoute('/_authed/workflows/$workflowId/runs/')({
  head: () => ({ meta: [{ title: 'Runs | AwaitStep' }] }),
  component: RunsListPage,
})

function RunsListPage() {
  const { workflowId } = useParams({ from: '/_authed/workflows/$workflowId/runs/' })
  const ready = useOrgReady()
  return <RunsPanel workflowId={workflowId} ready={ready} />
}
