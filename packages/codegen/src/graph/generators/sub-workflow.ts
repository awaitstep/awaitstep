import type { WorkflowNode } from '@awaitstep/ir'
import { derivedStepLabel, type GenerateMode, type GenerationContext } from '../internal.js'

/**
 * A call to another deployed workflow, provider-neutrally. The generated code
 * asks the runtime adapter to start the child and, when asked, to read its
 * status inside a retrying step. Provider specifics (a Cloudflare binding
 * name, a Temporal namespace, …) arrive through the node's `params` object;
 * the provider adapter reads only its own key.
 */
export function generateSubWorkflow(
  node: WorkflowNode,
  ctx: GenerationContext,
  mode: GenerateMode = 'workflow',
): string {
  const varName = ctx.varName(node.id)
  const workflowId = String(node.data.workflowId ?? '').trim()
  const exportName = optionalString(node.data.workflowName)
  const input = optionalString(node.data.input)
  const waitForCompletion = node.data.waitForCompletion !== false
  const timeout = optionalString(node.data.timeout)
  const params = recordOf(node.data.params)

  const options = callOptions([
    ['workflow', JSON.stringify(workflowId)],
    ['exportName', exportName && JSON.stringify(exportName)],
    ['input', input],
    ['waitForCompletion', String(waitForCompletion)],
    ['timeout', timeout && JSON.stringify(timeout)],
    ['params', params && JSON.stringify(params)],
  ])

  // A function has no durable step runner; the adapter call runs inline.
  if (mode === 'script') {
    return `const ${varName} = await flow.startWorkflow(${options});`
  }

  const instanceVar = `${varName}_instance`
  const lines = [
    `const ${instanceVar} = await flow.step("${derivedStepLabel(node, 'create')}", () => flow.startWorkflow(${options}));`,
  ]
  if (!waitForCompletion) {
    lines.push(`const ${varName} = ${instanceVar};`)
    return lines.join('\n')
  }

  const statusCall = `flow.workflowStatus(${instanceVar}.instanceId, ${options})`
  lines.push(
    `const ${varName} = await flow.step("${derivedStepLabel(node, 'await')}", {`,
    `  retries: { limit: 60, delay: "5 seconds", backoff: "linear" },`,
    `}, async () => {`,
    `  const status = await ${statusCall};`,
    `  if (status.status === "complete" || status.status === "succeeded") return status.output;`,
    `  if (status.status === "errored" || status.status === "failed" || status.status === "terminated" || status.status === "cancelled") {`,
    `    throw new Error(status.error?.message ?? "Sub-workflow failed");`,
    `  }`,
    `  throw new Error("Still running");`,
    `});`,
  )
  return lines.join('\n')
}

/**
 * Provider bindings a workflow's `Env` needs for its sub-workflow calls: one
 * per distinct target, derived from the provider export name (a Cloudflare
 * binding is named after the exported class) unless `params.<provider>.binding`
 * names it explicitly.
 */
export function getSubWorkflowBindings(
  nodes: readonly { type: string; data: Record<string, unknown> }[],
  provider: string,
): SubWorkflowBinding[] {
  const seen = new Set<string>()
  const bindings: SubWorkflowBinding[] = []
  for (const node of nodes) {
    if (node.type !== 'sub_workflow') continue
    const exportName = String(node.data.workflowName ?? '').trim()
    const params = recordOf(node.data.params)?.[provider]
    const explicit =
      params && typeof params === 'object' ? (params as Record<string, unknown>).binding : undefined
    const binding =
      typeof explicit === 'string' && explicit.trim()
        ? explicit.trim()
        : exportName && classNameToUpperSnake(exportName)
    if (!binding || seen.has(binding)) continue
    seen.add(binding)
    bindings.push({
      binding,
      name: classNameToKebab(exportName),
      className: exportName,
      scriptName: String(node.data.workflowId ?? ''),
    })
  }
  return bindings
}

export interface SubWorkflowBinding {
  /** Env binding name, e.g. ONBOARDING_WORKFLOW */
  binding: string
  /** Provider workflow name, e.g. onboarding-workflow */
  name: string
  /** Exported workflow class name, e.g. OnboardingWorkflow */
  className: string
  /** The user-provided deployed name */
  scriptName: string
}

function callOptions(entries: Array<[string, string | undefined | false]>): string {
  return `{ ${entries
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    .map(([key, value]) => `${key}: ${value}`)
    .join(', ')} }`
}

function optionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function recordOf(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function classNameToUpperSnake(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .toUpperCase()
}

function classNameToKebab(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
}
