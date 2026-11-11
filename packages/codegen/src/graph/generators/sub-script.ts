import type { WorkflowNode } from '@awaitstep/ir'
import { stepLabel, type GenerateMode, type GenerationContext } from '../internal.js'
import { generateStepConfig } from './config.js'
import { DEFAULT_STEP_CONFIG, resolveStepConfig } from './step.js'

/**
 * A call to another deployed function/script, provider-neutrally. The runtime
 * adapter receives the target, request shape, and the node's provider-scoped
 * `params`; it maps them to a service binding, an HTTP call, or whatever its
 * runtime offers.
 */
export function generateSubScript(
  node: WorkflowNode,
  ctx: GenerationContext,
  mode: GenerateMode = 'workflow',
): string {
  const varName = ctx.varName(node.id)
  const script = String(node.data.scriptId ?? node.data.workerName ?? '').trim()
  const method = String(node.data.method ?? 'POST')
  const url = String(node.data.url ?? 'https://invoke/')
  const headers = recordOf(node.data.headers)
  const body = typeof node.data.body === 'string' ? node.data.body.trim() : ''
  const params = recordOf(node.data.params)

  const options = callOptions([
    ['script', JSON.stringify(script)],
    ['method', JSON.stringify(method)],
    ['url', JSON.stringify(url)],
    ['headers', headers && JSON.stringify(headers)],
    ['body', body.length > 0 ? body : undefined],
    ['params', params && JSON.stringify(params)],
  ])
  const call = `flow.callScript(${options})`

  if (mode === 'script') return `const ${varName} = await ${call};`

  const config = generateStepConfig(resolveStepConfig(node) ?? DEFAULT_STEP_CONFIG)
  const configArg = config ? `, ${config}` : ''
  return `const ${varName} = await flow.step("${stepLabel(node)}"${configArg}, () => ${call});`
}

function callOptions(entries: Array<[string, string | undefined]>): string {
  return `{ ${entries
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    .map(([key, value]) => `${key}: ${value}`)
    .join(', ')} }`
}

function recordOf(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}
