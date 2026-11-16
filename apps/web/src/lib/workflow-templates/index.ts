import { accountTemplates } from './accounts'
import { billingTemplates } from './billing'
import { commerceTemplates } from './commerce'
import { integrationTemplates } from './integrations'
import { onboardingTemplates } from './onboarding'
import { REGISTRY_NODES } from './template-nodes'
import type { TemplateCategory, WorkflowTemplate } from './types'

export type { TemplateCategory, TemplateCategoryId, WorkflowTemplate } from './types'
export { REGISTRY_NODES } from './template-nodes'

export const templateCategories: TemplateCategory[] = [
  { id: 'billing', name: 'Billing', description: 'Payments, trials and usage.' },
  { id: 'onboarding', name: 'Onboarding', description: 'Signups, invites and retention.' },
  { id: 'accounts', name: 'Accounts & data', description: 'Deletion, exports and setup.' },
  {
    id: 'integrations',
    name: 'Integrations & ops',
    description: 'Webhooks, approvals and alerts.',
  },
  { id: 'commerce', name: 'Commerce', description: 'Orders, carts and feedback.' },
]

export const workflowTemplates: WorkflowTemplate[] = [
  ...billingTemplates,
  ...onboardingTemplates,
  ...accountTemplates,
  ...integrationTemplates,
  ...commerceTemplates,
]

/** The display names of the registry nodes a template uses, in first-use order. */
export function templateRegistryNodes(template: WorkflowTemplate): string[] {
  const names = new Set<string>()
  for (const node of template.ir.nodes) {
    if (Object.hasOwn(REGISTRY_NODES, node.type)) {
      names.add(REGISTRY_NODES[node.type as keyof typeof REGISTRY_NODES].name)
    }
  }
  return [...names]
}
