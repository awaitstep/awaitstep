import type { WorkflowIR } from '@awaitstep/ir'

/** The icon a template shows, by name; each app draws it from its own icon set. */
export type TemplateIconName =
  | 'building-2'
  | 'credit-card'
  | 'download'
  | 'gauge'
  | 'heart-handshake'
  | 'hourglass'
  | 'mail-plus'
  | 'message-square'
  | 'send'
  | 'shopping-bag'
  | 'shopping-cart'
  | 'siren'
  | 'user-check'
  | 'user-plus'
  | 'user-x'
  | 'webhook'

export type TemplateCategoryId = 'billing' | 'onboarding' | 'accounts' | 'integrations' | 'commerce'

export interface TemplateCategory {
  id: TemplateCategoryId
  name: string
  description: string
}

/** A starting point: the shape of a job with stubs to fill in, not a finished workflow. */
export interface WorkflowTemplate {
  id: string
  name: string
  description: string
  icon: TemplateIconName
  category: TemplateCategoryId
  ir: WorkflowIR
}
