import { accountTemplates } from './accounts.js'
import { billingTemplates } from './billing.js'
import { commerceTemplates } from './commerce.js'
import { integrationTemplates } from './integrations.js'
import { onboardingTemplates } from './onboarding.js'
import { REGISTRY_NODES } from './template-nodes.js'
import type { TemplateCategory, WorkflowTemplate } from './types.js'

export type {
  TemplateCategory,
  TemplateCategoryId,
  TemplateIconName,
  WorkflowTemplate,
} from './types.js'
export { REGISTRY_NODES } from './template-nodes.js'

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
