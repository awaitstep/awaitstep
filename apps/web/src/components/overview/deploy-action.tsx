import { Rocket } from 'lucide-react'
import type { WorkflowNode, Edge as IREdge } from '@awaitstep/ir'
import { Button } from '../ui/button'
import { actionToast, failureLine } from '../../lib/action-toast'
import { fallbackPosition } from '../../lib/hydrate-workflow'
import { validateWorkflowForPublish } from '../../lib/validate-workflow'
import { useWorkflowLinks } from '../../lib/workflows/detail-links'
import { useGoTo } from '../navigation/router-shell-link'
import { useApi } from '../../contexts/api-client-context'

const MAX_LISTED = 3

interface DeployButtonProps {
  workflowId: string
  currentVersionId?: string | null
  kind?: 'workflow' | 'script'
  deployBlocked?: boolean
  /** The button's words; "Deploy" unless said, e.g. a function's "Publish v4". */
  label?: string
}

/** Validates the current version and navigates to the deploy wizard when it passes. */
export function DeployButton({
  workflowId,
  currentVersionId,
  kind,
  deployBlocked,
  label = 'Deploy',
}: DeployButtonProps) {
  const api = useApi()
  const goTo = useGoTo()
  const links = useWorkflowLinks(workflowId)

  async function handleDeploy() {
    if (!currentVersionId) {
      actionToast.error('Nothing to deploy yet', {
        description: 'Open the editor and save your workflow first.',
      })
      return
    }
    try {
      const ver = await api.getVersion(workflowId, currentVersionId)
      const ir = JSON.parse(ver.ir) as {
        metadata: { name: string; description?: string }
        nodes: WorkflowNode[]
        edges: IREdge[]
      }
      const flowNodes = ir.nodes.map((n, i) => ({
        id: n.id,
        type: n.type,
        position: n.position ?? fallbackPosition(i),
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
        kind,
      )
      if (!result.canPublish) {
        // One summary rather than a toast per issue. This page has no problems
        // list, so the first few ride along; the editor lists them all.
        const errors = result.issues.filter((i) => i.severity === 'error')
        const shown = errors
          .slice(0, MAX_LISTED)
          .map((issue) => (issue.nodeName ? `${issue.nodeName}: ${issue.message}` : issue.message))
        if (errors.length > MAX_LISTED) shown.push('Open the editor to see the rest.')
        actionToast.error(
          errors.length === 1
            ? 'Fix 1 issue before deploying'
            : `Fix ${errors.length} issues before deploying`,
          { description: shown.join(' · ') },
        )
        return
      }
    } catch (err) {
      actionToast.error(failureLine(err, 'Couldn’t check the workflow'))
      return
    }
    goTo(links.deploy)
  }

  return (
    <Button
      size="sm"
      className="gap-1.5"
      disabled={deployBlocked}
      title={deployBlocked ? 'Deployed version is locked' : undefined}
      onClick={handleDeploy}
    >
      <Rocket className="h-3.5 w-3.5" />
      {label}
    </Button>
  )
}
