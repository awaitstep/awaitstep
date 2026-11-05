import { createFileRoute } from '@tanstack/react-router'
import { LegacyItemRedirect } from '../../components/navigation/legacy-item-redirect'
import { LegacyRedirect } from '../../components/navigation/legacy-redirect'

// Legacy URL: a run now lives under its workflow's workspace URL. Without the
// workflow there is no way to place it, so it lands on the Runs list.
export const Route = createFileRoute('/_authed/runs/$runId')({
  validateSearch: (search: Record<string, unknown>) => ({
    workflowId: typeof search.workflowId === 'string' ? search.workflowId : '',
  }),
  component: LegacyRun,
})

function LegacyRun() {
  const { runId } = Route.useParams()
  const { workflowId } = Route.useSearch()
  if (!workflowId) return <LegacyRedirect page="runs" />
  return <LegacyItemRedirect workflowId={workflowId} page={{ kind: 'run', runId }} />
}
