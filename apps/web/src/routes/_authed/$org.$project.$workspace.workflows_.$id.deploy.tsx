import { createFileRoute } from '@tanstack/react-router'
import { pageHead, type DashboardPage } from '../../components/navigation/dashboard-page'
import { DeployPage } from '../../components/deploy/deploy-page'
import { ItemPage } from '../../components/workflow-detail/item-page'
import { DEPLOY_INTRO } from '../../components/deploy/deploy-copy'

const page: DashboardPage = { kind: 'item', page: 'deploy' }

export const Route = createFileRoute('/_authed/$org/$project/$workspace/workflows_/$id/deploy')({
  staticData: { dashboardPage: page },
  head: () => pageHead(page),
  component: DeployRoute,
})

function DeployRoute() {
  const { id, ...slugs } = Route.useParams()
  return (
    <ItemPage slugs={slugs} workflowId={id} page="deploy">
      {({ workflow }) => (
        <div className="flex flex-col gap-5">
          <p className="text-sm text-muted-foreground">
            {DEPLOY_INTRO[workflow.kind ?? 'workflow']}
          </p>
          <DeployPage workflowId={id} kind={workflow.kind} />
        </div>
      )}
    </ItemPage>
  )
}
