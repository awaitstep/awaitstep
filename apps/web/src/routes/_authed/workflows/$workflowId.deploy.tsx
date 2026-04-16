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
    <div className="mx-auto w-full max-w-screen-lg px-8 py-6">
      <PageHeader
        title={`Deploy ${workflow?.name ?? 'Workflow'}`}
        description="Configure and deploy to a provider connection."
        breadcrumbs={[
          { label: 'Workflows', href: '/workflows' },
          { label: workflow?.name ?? workflowId, href: `/workflows/${workflowId}` },
          { label: 'Deploy' },
        ]}
      />
      <div className="pt-6">
        <LoadingView isLoading={isLoading || !ready} LoadingPlaceholder={DetailSkeleton}>
          <DeployPage workflowId={workflowId} />
        </LoadingView>
      </div>
    </div>
  )
}
