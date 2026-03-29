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

export function getSubWorkflowBindings(
  nodes: readonly { type: string; data: Record<string, unknown> }[],
): string[] {
  const bindings: string[] = []
  for (const node of nodes) {
    if (node.type !== 'sub_workflow') continue
    const name = String(node.data.workflowName ?? '')
    if (name) {
      bindings.push(sanitizeIdentifier(name).toUpperCase() + '_WORKFLOW')
    }
  }
  return [...new Set(bindings)]
}
