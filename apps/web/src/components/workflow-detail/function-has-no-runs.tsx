import { Navigate } from '@tanstack/react-router'
import { useWorkflowLinks } from '../../lib/workflows/detail-links'
import { routerTarget } from '../navigation/router-shell-link'

/**
 * A function answers straight away, so it has no runs: its Runs URLs land on
 * its Overview, and the old URL leaves history.
 */
export function FunctionHasNoRuns({ workflowId }: { workflowId: string }) {
  const target = routerTarget(useWorkflowLinks(workflowId).overview)
  if (target.kind !== 'router') return null
  return <Navigate to={target.to} replace />
}
