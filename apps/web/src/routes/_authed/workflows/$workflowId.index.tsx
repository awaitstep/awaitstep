import { createFileRoute, Link, useParams, redirect } from '@tanstack/react-router'
import { useQuery, useInfiniteQuery } from '@tanstack/react-query'
import { useState, useMemo } from 'react'
import { toast } from 'sonner'
import type { WorkflowNode, Edge as IREdge } from '@awaitstep/ir'
import { validateWorkflowForPublish } from '../../../lib/validate-workflow'
import { Pencil, Rocket, Clock } from 'lucide-react'
import { Button } from '../../../components/ui/button'
import { api } from '../../../lib/api-client'
import { queries, flatPages } from '../../../lib/queries'
import { useOrgReady } from '../../../stores/org-store'
import { timeAgo } from '../../../lib/time'
import { WorkflowActionsMenu } from '../../../components/dashboard/workflow-actions-menu'
import { TriggerButton } from '../../../components/dashboard/trigger-button'
import { DeployDialog } from '../../../components/canvas/deploy-dialog'
import { EditableName, EditableDescription } from '../../../components/overview/editable-field'
import { VersionList } from '../../../components/overview/version-list'
import { RecentRuns } from '../../../components/overview/recent-runs'
import { DeploymentCard, DeployStatusBadge } from '../../../components/overview/deployment-card'
import { LoadingView } from '../../../components/ui/loading-view'
import { DetailSkeleton } from '../../../components/ui/skeletons'

export const Route = createFileRoute('/_authed/workflows/$workflowId/')({
  beforeLoad: ({ params }) => {
    if (params.workflowId === 'new') {
      throw redirect({ to: '/workflows/$workflowId/canvas', params })
    }
  },
  component: WorkflowOverviewPage,
})

function WorkflowOverviewPage() {
  const ready = useOrgReady()
  const { workflowId } = useParams({ from: '/_authed/workflows/$workflowId/' })
  const [deployOpen, setDeployOpen] = useState(false)

  const { data: workflow, isLoading: wfLoading } = useQuery({
    queryKey: ['workflow', workflowId],
    queryFn: () => api.getWorkflow(workflowId),
    enabled: ready,
  })

  const {
    data: versionsData,
    hasNextPage: versionsHasMore,
    fetchNextPage: versionsFetchNext,
    isFetchingNextPage: versionsLoadingMore,
  } = useInfiniteQuery({ ...queries.versions.byWorkflow(workflowId), enabled: ready })
  const versions = flatPages(versionsData)

  const { data: deployments } = useInfiniteQuery({
    ...queries.deployments.byWorkflow(workflowId),
    enabled: ready,
    select: (data) => flatPages(data),
  })

  const { data: runs } = useInfiniteQuery({
    ...queries.runs.all(workflowId),
    enabled: ready,
    select: (data) => flatPages(data),
  })

  const workflowRuns = useMemo(
    () => runs?.filter((r) => r.workflowId === workflowId) ?? [],
    [runs, workflowId],
  )
  const currentVersion = versions?.[0]?.version ?? 0
  const activeDeployment = useMemo(
    () => deployments?.find((d) => d.status === 'success'),
    [deployments],
  )
  const hasActiveDeployment = !!activeDeployment
  const latestDeployment = deployments?.[0]
  const deployedVersion = useMemo(
    () => versions?.find((v) => v.id === activeDeployment?.versionId),
    [versions, activeDeployment],
  )
  const hasUndeployedChanges =
    hasActiveDeployment && activeDeployment.versionId !== workflow?.currentVersionId
  const deployBlocked = deployedVersion?.locked === 1

  return (
    <LoadingView isLoading={wfLoading} LoadingPlaceholder={DetailSkeleton}>
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
            <div className="flex shrink-0 items-center gap-2">
              <Link to="/workflows/$workflowId/canvas" params={{ workflowId }}>
                <Button size="sm" variant="outline" className="gap-1.5">
                  <Pencil className="h-3.5 w-3.5" />
                  Open Editor
                </Button>
              </Link>
              <Button
                size="sm"
                className="gap-1.5"
                disabled={deployBlocked}
                title={deployBlocked ? 'Deployed version is locked' : undefined}
                onClick={async () => {
                  if (!workflow?.currentVersionId) {
                    toast.error(
                      'No version to deploy. Open the editor and save your workflow first.',
                    )
                    return
                  }
                  try {
                    const ver = await api.getVersion(workflowId, workflow.currentVersionId)
                    const ir = JSON.parse(ver.ir) as {
                      metadata: { name: string; description?: string }
                      nodes: WorkflowNode[]
                      edges: IREdge[]
                    }
                    const flowNodes = ir.nodes.map((n) => ({
                      id: n.id,
                      type: n.type,
                      position: n.position,
                      data: { irNode: n },
                    }))
                    const flowEdges = ir.edges.map((e) => ({
                      id: e.id,
                      source: e.source,
                      target: e.target,
                      label: e.label,
                    }))
                    const result = validateWorkflowForPublish(ir.metadata, flowNodes, flowEdges)
                    if (!result.canPublish) {
                      const errors = result.issues.filter((i) => i.severity === 'error')
                      for (const issue of errors) {
                        toast.error(
                          issue.nodeName ? `${issue.nodeName}: ${issue.message}` : issue.message,
                        )
                      }
                      return
                    }
                  } catch {
                    toast.error('Failed to validate workflow')
                    return
                  }
                  setDeployOpen(true)
                }}
              >
                <Rocket className="h-3.5 w-3.5" />
                Deploy
              </Button>
              {hasActiveDeployment && <TriggerButton workflowId={workflowId} />}
              <WorkflowActionsMenu workflow={workflow} isDeployed={hasActiveDeployment} />
            </div>
          </div>

          {/* Info row */}
          <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              Created {timeAgo(workflow.createdAt)}
            </span>
            <span>Updated {timeAgo(workflow.updatedAt)}</span>
            {currentVersion > 0 && (
              <span className="rounded bg-muted/60 px-1.5 py-0.5 font-medium text-muted-foreground">
                v{currentVersion}
              </span>
            )}
            <DeployStatusBadge
              hasActiveDeployment={hasActiveDeployment}
              hasUndeployedChanges={!!hasUndeployedChanges}
              deployedVersion={deployedVersion?.version}
            />
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            <VersionList
              workflowId={workflowId}
              workflow={workflow}
              versions={versions ?? []}
              activeDeployment={activeDeployment}
              deployBlocked={deployBlocked}
              hasMore={!!versionsHasMore}
              loadingMore={versionsLoadingMore}
              onLoadMore={() => versionsFetchNext()}
            />
            <RecentRuns workflowId={workflowId} runs={workflowRuns} />
          </div>

          {latestDeployment && <DeploymentCard deployment={latestDeployment} />}

          {deployOpen && (
            <DeployDialog onClose={() => setDeployOpen(false)} workflowId={workflowId} />
          )}
        </>
      ) : (
        <div className="flex min-h-[60vh] items-center justify-center">
          <p className="text-sm text-muted-foreground">Workflow not found</p>
        </div>
      )}
    </LoadingView>
  )
}
