import { createFileRoute, Link, useParams, redirect } from '@tanstack/react-router'
import { useQuery, useInfiniteQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { toast } from 'sonner'
import type { WorkflowNode, Edge as IREdge } from '@awaitstep/ir'
import { validateWorkflowForPublish } from '../../../lib/validate-workflow'
import { Pencil, Rocket, GitBranch, Activity, Globe } from 'lucide-react'
import { Button } from '../../../components/ui/button'
import { api } from '../../../lib/api-client'
import { queries, flatPages } from '../../../lib/queries'
import { useOrgReady } from '../../../stores/org-store'
import { timeAgo } from '../../../lib/time'
import { WorkflowActionsMenu } from '../../../components/dashboard/workflow-actions-menu'
import { TriggerButton } from '../../../components/dashboard/trigger-button'
import { useNavigate } from '@tanstack/react-router'
import { EditableName, EditableDescription } from '../../../components/overview/editable-field'
import { VersionList } from '../../../components/overview/version-list'
import { RecentRuns } from '../../../components/overview/recent-runs'
import { DeployStatusBadge } from '../../../components/overview/deployment-card'
import { LoadingView } from '../../../components/ui/loading-view'
import { DetailSkeleton } from '../../../components/ui/skeletons'

export const Route = createFileRoute('/_authed/workflows/$workflowId/')({
  head: () => ({ meta: [{ title: 'Workflow | AwaitStep' }] }),
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
  const navigate = useNavigate()

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
                    const result = validateWorkflowForPublish(
                      ir.metadata,
                      flowNodes,
                      flowEdges,
                      undefined,
                      undefined,
                      workflow.kind,
                    )
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
                  navigate({ to: '/workflows/$workflowId/deploy', params: { workflowId } })
                }}
              >
                <Rocket className="h-3.5 w-3.5" />
                Deploy
              </Button>
              {hasActiveDeployment && <TriggerButton workflowId={workflowId} />}
              <WorkflowActionsMenu workflow={workflow} isDeployed={hasActiveDeployment} />
            </div>
          </div>

          {/* Status strip */}
          <div className="mt-6 grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-border bg-card px-4 py-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <GitBranch className="h-3.5 w-3.5" />
                Version
              </div>
              <p className="mt-1 text-lg font-semibold text-foreground">
                {currentVersion > 0 ? `v${currentVersion}` : '—'}
              </p>
              <p className="text-xs text-muted-foreground/60">
                Updated {timeAgo(workflow.updatedAt)}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-card px-4 py-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Globe className="h-3.5 w-3.5" />
                Deployment
              </div>
              <div className="mt-1">
                {hasActiveDeployment ? (
                  <>
                    <DeployStatusBadge
                      hasActiveDeployment={hasActiveDeployment}
                      hasUndeployedChanges={!!hasUndeployedChanges}
                      deployedVersion={deployedVersion?.version}
                    />
                    {latestDeployment?.serviceUrl && (
                      <a
                        href={latestDeployment.serviceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1.5 flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        {latestDeployment.serviceUrl.replace(/^https?:\/\//, '')}
                      </a>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground/60">Not deployed</p>
                )}
              </div>
            </div>
            <div className="rounded-lg border border-border bg-card px-4 py-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Activity className="h-3.5 w-3.5" />
                Runs
              </div>
              <p className="mt-1 text-lg font-semibold text-foreground">
                {workflowRuns.length > 0 ? workflowRuns.length : '—'}
              </p>
              <p className="text-xs text-muted-foreground/60">
                Created {timeAgo(workflow.createdAt)}
              </p>
            </div>
          </div>

          {/* Recent Runs + Versions side by side */}
          <div className="mt-6 grid gap-6 lg:grid-cols-5">
            <div className="lg:col-span-3">
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
            </div>
            <div className="lg:col-span-2">
              <RecentRuns workflowId={workflowId} runs={workflowRuns} />
            </div>
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
