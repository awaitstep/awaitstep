export function workerName(workflowId: string): string {
  const sanitized = workflowId
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  if (!sanitized) {
    throw new Error('workflowId must contain at least one alphanumeric character')
  }

  return `awaitstep-${sanitized}`
}

export function sanitizedWorkflowName(workflowName: string): string {
  const sanitized = workflowName
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64)

  if (!sanitized || /^[^a-zA-Z0-9_]/.test(sanitized)) {
    return `wf-${sanitized}`.slice(0, 64)
  }

  return sanitized
}

export function workflowClassName(workflowName: string): string {
  const result = workflowName
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .split('_')
    .filter(Boolean)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join('')

  if (!result) {
    throw new Error('workflowName must contain at least one alphanumeric character')
  }

  if (/^\d/.test(result)) {
    return `Workflow${result}`
  }

  return result
}
