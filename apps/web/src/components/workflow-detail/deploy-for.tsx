import type { WorkflowSummary } from '../../lib/api-client'
import { DeployButton } from '../overview/deploy-action'

/** Deploy, as the header's: checks the latest version, then the Deploy page (24f's empty states). */
export function DeployFor({ workflow }: { workflow: WorkflowSummary }) {
  return (
    <DeployButton
      workflowId={workflow.id}
      currentVersionId={workflow.currentVersionId}
      kind={workflow.kind}
    />
  )
}
