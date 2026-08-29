import { createFileRoute, useParams } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { PageHeader } from '../../../components/ui/page-header'
import { LoadingView } from '../../../components/ui/loading-view'
import { DetailSkeleton } from '../../../components/ui/skeletons'
import { RequireProject } from '../../../wrappers/require-project'
import { DeployPage } from '../../../components/deploy/deploy-page'
import { api } from '../../../lib/api-client'
import { useOrgReady } from '../../../stores/org-store'

export const Route = createFileRoute('/_authed/workflows/$workflowId/deploy')({
  head: () => ({ meta: [{ title: 'Deploy | AwaitStep' }] }),
  component: DeployRoute,
})

function DeployRoute() {
  return (
    <RequireProject>
      <DeployRouteContent />
    </RequireProject>
  )
}

function DeployRouteContent() {
  const { workflowId } = useParams({ from: '/_authed/workflows/$workflowId/deploy' })
  const ready = useOrgReady()
  const { data: workflow, isLoading } = useQuery({
    queryKey: ['workflow', workflowId],
    queryFn: () => api.getWorkflow(workflowId),
    enabled: ready,
  })

  return (
    <div className="@container mx-auto w-full max-w-screen-xl px-6 py-6 md:px-8">
      <PageHeader
        title={`Deploy ${workflow?.name ?? 'Workflow'}`}
        breadcrumbs={[
          { label: 'Workflows', href: '/workflows' },
          { label: workflow?.name ?? workflowId, href: `/workflows/${workflowId}` },
          { label: 'Deploy' },
        ]}
      />
      <p className="mt-4 text-sm text-muted-foreground">
        {workflow?.kind === 'script'
          ? 'Deploy as a fetch-only Worker. Invoke via HTTP POST — the response is the function’s return value.'
          : 'Configure and deploy to a provider connection.'}
      </p>
      <div className="pt-5">
        <LoadingView isLoading={isLoading || !ready} LoadingPlaceholder={DetailSkeleton}>
          <DeployPage workflowId={workflowId} kind={workflow?.kind} />
        </LoadingView>
      </div>
    </div>
  )
}
