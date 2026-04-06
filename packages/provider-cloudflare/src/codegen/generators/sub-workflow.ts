import type { WorkflowNode } from '@awaitstep/ir'
import { varName, escName, sanitizeIdentifier } from '@awaitstep/codegen'

export function generateSubWorkflow(node: WorkflowNode): string {
  const workflowName = String(node.data.workflowName ?? '')
  const bindingName = sanitizeIdentifier(workflowName).toUpperCase() + '_WORKFLOW'
  const input = node.data.input as string | undefined
  const waitForCompletion = node.data.waitForCompletion !== false
  const instanceVar = `${varName(node.id)}_instance`
  const paramsArg = input ? `, params: ${input}` : ''

  const lines: string[] = []

  // Step 1: Create child workflow instance
  lines.push(
    `const ${instanceVar} = await step.do("Create ${escName(workflowName)}", async () => {`,
  )
  lines.push(
    `  const instance = await env.${bindingName}.create({ id: crypto.randomUUID()${paramsArg} });`,
  )
  lines.push(`  return { instanceId: instance.id };`)
  lines.push(`});`)

  if (waitForCompletion) {
    // Step 2: Poll until child completes
    const resultVar = varName(node.id)
    lines.push('')
    lines.push(`const ${resultVar} = await step.do("Await ${escName(workflowName)}", {`)
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
  /** Env binding name, e.g. ORDER_FULFILLMENT_WORKFLOW */
  binding: string
  /** Sanitized CF workflow name derived from workflowName */
  name: string
  /** The user-provided script name (deployed worker name) */
  scriptName: string
}

export function getSubWorkflowBindings(
  nodes: readonly { type: string; data: Record<string, unknown> }[],
): SubWorkflowBinding[] {
  const seen = new Set<string>()
  const bindings: SubWorkflowBinding[] = []
  for (const node of nodes) {
    if (node.type !== 'sub_workflow') continue
    const workflowName = String(node.data.workflowName ?? '')
    const scriptName = String(node.data.workflowId ?? '')
    if (!workflowName || !scriptName) continue
    const binding = sanitizeIdentifier(workflowName).toUpperCase() + '_WORKFLOW'
    if (seen.has(binding)) continue
    seen.add(binding)
    bindings.push({
      binding,
      name: sanitizeIdentifier(workflowName).toLowerCase().replace(/_/g, '-'),
      scriptName,
    })
  }
  return bindings
}
