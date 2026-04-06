import type { WorkflowNode } from '@awaitstep/ir'
import { varName, escName } from '@awaitstep/codegen'

export function generateSubWorkflow(node: WorkflowNode): string {
  const className = String(node.data.workflowName ?? '')
  const bindingName = classNameToUpperSnake(className)
  const input = node.data.input as string | undefined
  const waitForCompletion = node.data.waitForCompletion !== false
  const instanceVar = `${varName(node.id)}_instance`
  const paramsArg = input ? `, params: ${input}` : ''

  const lines: string[] = []

  // Step 1: Create child workflow instance
  lines.push(`const ${instanceVar} = await step.do("Create ${escName(className)}", async () => {`)
  lines.push(
    `  const instance = await env.${bindingName}.create({ id: crypto.randomUUID()${paramsArg} });`,
  )
  lines.push(`  return { instanceId: instance.id };`)
  lines.push(`});`)

  if (waitForCompletion) {
    // Step 2: Poll until child completes
    const resultVar = varName(node.id)
    lines.push('')
    lines.push(`const ${resultVar} = await step.do("Await ${escName(className)}", {`)
    lines.push(`  retries: { limit: 60, delay: "5 seconds", backoff: "linear" },`)
    lines.push(`}, async () => {`)
    lines.push(`  const instance = await env.${bindingName}.get(${instanceVar}.instanceId);`)
    lines.push(`  const status = await instance.status();`)
    lines.push(`  if (status.status === "complete") return status.output;`)
    lines.push(
      `  if (status.status === "errored") throw new NonRetryableError(status.error?.message ?? "Sub-workflow failed");`,
    )
    lines.push(`  throw new Error("Still running");`)
    lines.push(`});`)
  }

  return lines.join('\n')
}

export interface SubWorkflowBinding {
  /** Env binding name, e.g. ONBOARDING_WORKFLOW */
  binding: string
  /** CF workflow name, e.g. onboarding-workflow */
  name: string
  /** Exported workflow class name, e.g. OnboardingWorkflow */
  className: string
  /** The user-provided script name (deployed worker name) */
  scriptName: string
}

/**
 * Convert a PascalCase class name to UPPER_SNAKE_CASE.
 * e.g. "OnboardingWorkflow" → "ONBOARDING_WORKFLOW"
 */
function classNameToUpperSnake(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .toUpperCase()
}

/**
 * Convert a PascalCase class name to kebab-case.
 * e.g. "OnboardingWorkflow" → "onboarding-workflow"
 */
function classNameToKebab(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .toLowerCase()
}

export function getSubWorkflowBindings(
  nodes: readonly { type: string; data: Record<string, unknown> }[],
): SubWorkflowBinding[] {
  const seen = new Set<string>()
  const bindings: SubWorkflowBinding[] = []
  for (const node of nodes) {
    if (node.type !== 'sub_workflow') continue
    const className = String(node.data.workflowName ?? '')
    const scriptName = String(node.data.workflowId ?? '')
    if (!className || !scriptName) continue
    const binding = classNameToUpperSnake(className)
    if (seen.has(binding)) continue
    seen.add(binding)
    bindings.push({
      binding,
      name: classNameToKebab(className),
      className,
      scriptName,
    })
  }
  return bindings
}
