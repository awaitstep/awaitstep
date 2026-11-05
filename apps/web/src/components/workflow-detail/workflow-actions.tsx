import { FileCode2 } from 'lucide-react'
import type { WorkflowSummary } from '../../lib/api-client'
import { useWorkflowLinks } from '../../lib/workflows/detail-links'
import { TriggerButton } from '../dashboard/trigger-button'
import { WorkflowActionsMenu } from '../dashboard/workflow-actions-menu'
import { RouterShellLink } from '../navigation/router-shell-link'
import { DeployButton } from '../overview/deploy-action'
import { Button } from '../ui/button'
import type { WorkflowOverview } from './use-workflow-overview'

interface WorkflowActionsProps {
  workflow: WorkflowSummary
  overview: Pick<WorkflowOverview, 'hasActiveDeployment' | 'deployBlocked'>
}

/** Open editor · Deploy · Trigger run · ⋯ — a workflow's actions on its own pages. */
export function WorkflowActions({ workflow, overview }: WorkflowActionsProps) {
  const links = useWorkflowLinks(workflow.id)
  // One editor with two surfaces; it opens in Code mode and the header
  // switches to Canvas. A workflow with no saved version has no source yet,
  // so it starts on the canvas instead.
  const editorHref = links.editor(workflow.currentVersionId ? 'ide' : 'canvas')

  return (
    <div className="flex shrink-0 items-center gap-2">
      <RouterShellLink href={editorHref}>
        <Button size="sm" variant="outline" className="gap-1.5">
          <FileCode2 className="h-3.5 w-3.5" />
          Open Editor
        </Button>
      </RouterShellLink>
      <DeployButton
        workflowId={workflow.id}
        currentVersionId={workflow.currentVersionId}
        kind={workflow.kind}
        deployBlocked={overview.deployBlocked}
      />
      {overview.hasActiveDeployment && <TriggerButton workflowId={workflow.id} />}
      <WorkflowActionsMenu workflow={workflow} isDeployed={overview.hasActiveDeployment} />
    </div>
  )
}
