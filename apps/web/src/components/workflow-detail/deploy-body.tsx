import { useQuery } from '@tanstack/react-query'
import { ApiError, type WorkflowSummary, type WorkflowVersion } from '../../lib/api-client'
import { useWorkflowLinks } from '../../lib/workflows/detail-links'
import { DEPLOY_INTRO } from '../deploy/deploy-copy'
import { DeployPage } from '../deploy/deploy-page'
import { RouterShellLink } from '../navigation/router-shell-link'
import { Bone } from '../ui/skeletons'
import { useApi } from '../../contexts/api-client-context'
import { useEditorAccess } from '../../contexts/editor-scope-context'

function versionLine(version: WorkflowVersion, currentVersionId: string | null | undefined) {
  const latest = version.id === currentVersionId
  return `Deploys v${version.version}, ${latest ? 'the latest' : 'not the latest'}.`
}

interface DeployBodyProps {
  workflow: WorkflowSummary
  /** `?version=`: the version to deploy, when it isn't the current one. */
  versionId: string | undefined
  /** The account to start on, when the link names one. */
  connectionId?: string
}

/**
 * Deploy: which version goes out, then the form. A version named in the URL
 * is looked up first, so the page always says which one it is — a link can't
 * ship an old version while the page reads as the latest.
 */
export function DeployBody({ workflow, versionId, connectionId }: DeployBodyProps) {
  const api = useApi()
  const links = useWorkflowLinks(workflow.id)
  const { canDeploy, reason } = useEditorAccess()
  const picked = useQuery({
    queryKey: ['workflow-version', workflow.id, versionId],
    queryFn: () => api.getVersion(workflow.id, versionId!),
    enabled: canDeploy && !!versionId,
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

  const line = picked.data
    ? versionLine(picked.data, workflow.currentVersionId)
    : DEPLOY_INTRO[workflow.kind ?? 'workflow']

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-muted-foreground">{line}</p>
      <DeployPage
        workflowId={workflow.id}
        versionId={versionId}
        connectionId={connectionId}
        kind={workflow.kind}
      />
    </div>
  )
}
