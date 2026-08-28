import { createFileRoute, useParams, useSearch } from '@tanstack/react-router'
import { RunDetail } from '../../components/monitoring/run-detail'
import { RequireProject } from '../../wrappers/require-project'

export const Route = createFileRoute('/_authed/runs/$runId')({
  head: () => ({ meta: [{ title: 'Run Details | AwaitStep' }] }),
  validateSearch: (search: Record<string, unknown>) => ({
    workflowId: typeof search.workflowId === 'string' ? search.workflowId : '',
  }),
  component: RunDetailPage,
})

function RunDetailPage() {
  const { runId } = useParams({ from: '/_authed/runs/$runId' })
  const { workflowId } = useSearch({ from: '/_authed/runs/$runId' })

  return (
    <RequireProject>
      <RunDetail runId={runId} workflowIdHint={workflowId} />
    </RequireProject>
  )
}
