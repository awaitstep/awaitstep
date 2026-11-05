import { createFileRoute, useParams } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { PageHeader } from '../../../components/ui/page-header'
import { LoadingView } from '../../../components/ui/loading-view'
import { DetailSkeleton } from '../../../components/ui/skeletons'
import { RequireProject } from '../../../wrappers/require-project'
import { DeployBody } from '../../../components/workflow-detail/deploy-body'
import { parseDeploySearch } from '../../../lib/workflows/deploy-search'
import { api } from '../../../lib/api-client'
import { useOrgReady } from '../../../stores/org-store'

export const Route = createFileRoute('/_authed/workflows/$workflowId/deploy')({
  head: () => ({ meta: [{ title: 'Deploy | AwaitStep' }] }),
  // `?version=`: deploy that version (Deploy this version), not the current one.
  validateSearch: parseDeploySearch,
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
  const { version } = Route.useSearch()
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
      <div className="pt-4">
        <LoadingView isLoading={isLoading || !ready} LoadingPlaceholder={DetailSkeleton}>
          {/* Says which version goes out, as the workspace's Deploy does. */}
          {workflow && <DeployBody workflow={workflow} versionId={version} />}
        </LoadingView>
      </div>
    </div>
  )
}
