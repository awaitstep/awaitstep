import { useQuery } from '@tanstack/react-query'
import { ApiError, type WorkflowSummary } from '../../lib/api-client'
import { useWorkflowLinks } from '../../lib/workflows/detail-links'
import { DeployPage } from '../deploy/deploy-page'
import { RouterShellLink } from '../navigation/router-shell-link'
import { Badge } from '../ui/badge'
import { Bone } from '../ui/skeletons'
import { useApi } from '../../contexts/api-client-context'
import { useEditorAccess } from '../../contexts/editor-scope-context'
import type { LiveDeployment } from '@awaitstep/ir'

interface DeployBodyProps {
  workflow: WorkflowSummary
  /** What is live on each account. */
  live: Pick<LiveDeployment, 'versionId'>[]
  /** `?version=`: the version to deploy, when it isn't the current one. */
  versionId: string | undefined
  /** The account to start on, when the link names one. */
  connectionId?: string
  /** Hide the page heading when the body is inside a dialog that already names it. */
  showHeader?: boolean
}

/** Deploy's head (25a): the title, the version going out ("v13 · draft"), the workflow's name. */
function DeployHeader({ name, pill }: { name: string; pill: string | null }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">Deploy</h1>
      {pill && <Badge className="px-2.5 py-1 text-xs">{pill}</Badge>}
      <span className="text-xs text-muted-foreground">{name}</span>
    </div>
  )
}

/**
 * Deploy: which version goes out, then the page. A version named in the URL
 * is looked up first, so the page always says which one it is — a link can't
 * ship an old version while the page reads as the latest.
 */
export function DeployBody({
  workflow,
  live,
  versionId,
  connectionId,
  showHeader = true,
}: DeployBodyProps) {
  const api = useApi()
  const links = useWorkflowLinks(workflow.id)
  const { canDeploy, reason } = useEditorAccess()
  // The version going out — the one the link names, else the latest save — for its number.
  const goingOutId = versionId ?? workflow.currentVersionId ?? undefined
  const picked = useQuery({
    queryKey: ['workflow-version', workflow.id, goingOutId],
    queryFn: () => api.getVersion(workflow.id, goingOutId!),
    enabled: canDeploy && !!goingOutId,
    retry: false,
  })

  // A Viewer reaching Deploy by its URL: the API would refuse at the end.
  if (!canDeploy) {
    return (
      <p role="alert" className="text-sm text-muted-foreground">
        {reason ?? 'You can’t deploy in this workspace.'}{' '}
        <RouterShellLink href={links.overview} className="text-status-success hover:underline">
          Back to the overview
        </RouterShellLink>
        .
      </p>
    )
  }

  if (versionId && picked.isPending) return <Bone className="h-4 w-72" />

  if (versionId && !picked.data) {
    const missing = picked.error instanceof ApiError && picked.error.status === 404
    return (
      <p role="alert" className="text-sm text-muted-foreground">
        {missing
          ? 'That version isn’t one of this workflow’s.'
          : 'We couldn’t look up that version.'}{' '}
        <RouterShellLink href={links.deploy} className="text-status-success hover:underline">
          Deploy the latest instead
        </RouterShellLink>
        .
      </p>
    )
  }

  // Only the latest save's lookup can be waited out: the page shows without its number.
  const number = picked.data?.version
  let pill: string | null = null
  if (number !== undefined) {
    const latest = picked.data?.id === workflow.currentVersionId
    // The latest save, live on no account: never sent anywhere.
    const draft = latest && !live.some((l) => l.versionId !== null && l.versionId === goingOutId)
    if (!latest) pill = `v${number} · not the latest`
    else pill = draft ? `v${number} · draft` : `v${number}`
  }

  return (
    <div className="flex flex-col gap-5">
      {showHeader && <DeployHeader name={workflow.name} pill={pill} />}
      <DeployPage
        workflowId={workflow.id}
        versionId={versionId}
        version={number}
        connectionId={connectionId}
        kind={workflow.kind}
      />
    </div>
  )
}
