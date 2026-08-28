import { useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import { Rocket } from 'lucide-react'
import type { WorkflowNode, Edge as IREdge } from '@awaitstep/ir'
import { Button } from '../ui/button'
import { api } from '../../lib/api-client'
import { validateWorkflowForPublish } from '../../lib/validate-workflow'

interface DeployButtonProps {
  workflowId: string
  currentVersionId?: string | null
  kind?: 'workflow' | 'script'
  deployBlocked?: boolean
}

/** Validates the current version and navigates to the deploy wizard when it passes. */
export function DeployButton({
  workflowId,
  currentVersionId,
  kind,
  deployBlocked,
}: DeployButtonProps) {
  const navigate = useNavigate()

  async function handleDeploy() {
    if (!currentVersionId) {
      toast.error('No version to deploy. Open the editor and save your workflow first.')
      return
    }
    try {
      const ver = await api.getVersion(workflowId, currentVersionId)
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
        kind,
      )
      if (!result.canPublish) {
        const errors = result.issues.filter((i) => i.severity === 'error')
        for (const issue of errors) {
          toast.error(issue.nodeName ? `${issue.nodeName}: ${issue.message}` : issue.message)
        }
        return
      }
    } catch {
      toast.error('Failed to validate workflow')
      return
    }
    navigate({ to: '/workflows/$workflowId/deploy', params: { workflowId } })
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
      Deploy
    </Button>
  )
}
