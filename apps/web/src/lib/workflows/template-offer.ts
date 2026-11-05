import type { WorkflowFull } from '../api-client'

/**
 * Whether the canvas may show its template picker: only for a workflow with
 * nothing saved yet — one not created (`/new`), or one the dashboard just
 * created, which has no version — so a template never replaces saved work.
 * Templates are workflow-shaped, so a function never gets one.
 */
export function offersTemplates(args: {
  isNew: boolean
  kindParam?: 'workflow' | 'script'
  fullData: Pick<WorkflowFull, 'workflow' | 'versions'> | undefined
}): boolean {
  const { isNew, kindParam, fullData } = args
  if (isNew) return kindParam !== 'script'
  if (!fullData) return false
  return fullData.workflow.kind !== 'script' && fullData.versions.length === 0
}
