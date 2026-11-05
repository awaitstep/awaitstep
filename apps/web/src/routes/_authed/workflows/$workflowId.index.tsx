import { createFileRoute, useParams, redirect } from '@tanstack/react-router'
import { useOrgReady } from '../../../stores/org-store'
import { EditableName, EditableDescription } from '../../../components/overview/editable-field'
import { OverviewSummary } from '../../../components/workflow-detail/overview-summary'
import { useWorkflowOverview } from '../../../components/workflow-detail/use-workflow-overview'
import { WorkflowActions } from '../../../components/workflow-detail/workflow-actions'
import { LoadingView } from '../../../components/ui/loading-view'
import { DetailSkeleton } from '../../../components/ui/skeletons'

export const Route = createFileRoute('/_authed/workflows/$workflowId/')({
  head: () => ({ meta: [{ title: 'Workflow | AwaitStep' }] }),
  beforeLoad: ({ params }) => {
    if (params.workflowId === 'new') {
      throw redirect({
        to: '/workflows/$workflowId/editor',
        params,
        search: { view: 'canvas' },
      })
    }
  },
  component: WorkflowOverviewPage,
})

function WorkflowOverviewPage() {
  const ready = useOrgReady()
  const { workflowId } = useParams({ from: '/_authed/workflows/$workflowId/' })
  const overview = useWorkflowOverview(workflowId, ready)
  const { workflow } = overview

  return (
    <LoadingView isLoading={overview.isLoading} LoadingPlaceholder={DetailSkeleton}>
      {workflow ? (
        <>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <EditableName workflowId={workflowId} initialValue={workflow.name} />
              <EditableDescription
                workflowId={workflowId}
                initialValue={workflow.description ?? ''}
              />
            </div>
            <WorkflowActions workflow={workflow} overview={overview} />
          </div>
          <div className="mt-6 flex flex-col gap-6">
            <OverviewSummary workflow={workflow} overview={overview} />
          </div>
        </>
      ) : (
        <div className="flex min-h-[60vh] items-center justify-center">
          <p className="text-sm text-muted-foreground">Workflow not found</p>
        </div>
      )}
    </LoadingView>
  )
}
