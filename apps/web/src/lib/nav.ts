import type { NavigateOptions } from '@tanstack/react-router'

export const NEW_WORKFLOW_NAV: NavigateOptions = {
  to: '/workflows/$workflowId/canvas',
  params: { workflowId: 'new' },
  search: { template: true },
}

export const NEW_FUNCTION_NAV: NavigateOptions = {
  to: '/workflows/$workflowId/canvas',
  params: { workflowId: 'new' },
  // Functions skip the template picker — templates are workflow-shaped.
  search: { kind: 'script' },
}
