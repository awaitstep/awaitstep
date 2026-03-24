import type { NavigateOptions } from '@tanstack/react-router'

export const NEW_WORKFLOW_NAV: NavigateOptions = {
  to: '/workflows/$workflowId/canvas',
  params: { workflowId: 'new' },
  search: { template: true },
}
