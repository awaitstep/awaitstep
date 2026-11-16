import type { WorkflowIR } from '@awaitstep/ir'
import type { LucideIcon } from 'lucide-react'

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
  icon: LucideIcon
  category: TemplateCategoryId
  ir: WorkflowIR
}
