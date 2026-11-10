import type { WorkflowNode } from '@awaitstep/ir'
import { stepLabel, type GenerationContext } from '../internal.js'
import { generateStepConfig } from './config.js'
import { isJsonLiteralBody } from './http-body.js'
import { resolveStepConfig } from './step.js'

/**
 * One HTTP node: a single `flow.http({...})` call carrying the node's config.
 * A request is not durable by default — a node says `durable: true` to be
 * wrapped in a step, which buys retries, a timeout and (in a workflow)
 * persistence. The runtime owns the request itself — URL building, body
 * encoding, the `Content-Type` header — so the wrapper is the only thing
 * codegen decides.
 *
 * In a function the call is the same; only the context it hangs off differs:
 * a plain request needs no host, a durable one runs inside `flow.step`, which
 * is what the in-request host supplies.
 */
export function generateHttp(node: WorkflowNode, ctx: GenerationContext): string {
  const method = String(node.data.method ?? 'GET')
  const url = String(node.data.url ?? '')
  const headers = recordField(node.data.headers)
  const queryParams = recordField(node.data.queryParams)
  const body = node.data.body
  const bodyExpression = typeof body === 'string' ? body : body ? String(body) : ''
  const jsonBody = typeof body === 'string' && isJsonLiteralBody(body)

  const options: string[] = []
  // GET with no options is the shape a browser would send anyway; naming it
  // keeps the emitted call short and the diff against a plain fetch small.
  if (method !== 'GET') options.push(`method: ${JSON.stringify(method)}`)
  options.push(`url: ${toJsLiteral(url)}`)
  const queryEntries = Object.entries(queryParams ?? {})
  if (queryEntries.length > 0) {
    options.push(`queryParams: ${objectLiteral(queryEntries)}`)
  }
  const headerEntries = Object.entries(headers ?? {})
  if (headerEntries.length > 0) {
    options.push(`headers: ${objectLiteral(headerEntries)}`)
  }
  if (bodyExpression.trim()) {
    // A JSON literal goes in as a value for the runtime to encode; any other
    // expression is the user's own code, whose result the runtime sends as-is
    // when it is a string.
    options.push(`body: ${jsonBody ? bodyExpression.trim() : bodyExpression}`)
  }

  // A body ending in a line comment would comment out the closing braces, so
  // close on the next line when the body carries one.
  const tail = /\/\//.test(bodyExpression) ? '\n' : ''
  const call = `flow.http({ ${options.join(', ')}${tail} })`
  const config = generateStepConfig(resolveStepConfig(node))
  const configArg = config ? `, ${config}` : ''
  const varName = ctx.varName(node.id)

  // Not durable: the request runs in the surrounding body — no retries, no
  // timeout, no durability. Opted into, it is a step like any other.
  if (node.data.durable !== true) {
    return `const ${varName} = await ${call};`
  }
  return `const ${varName} = await flow.step("${stepLabel(node)}"${configArg}, async () => ${call});`
}

function recordField(value: unknown): Record<string, string> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, string>)
    : undefined
}

function objectLiteral(entries: [string, unknown][]): string {
  const parts = entries.map(([key, value]) => `${JSON.stringify(key)}: ${toJsLiteral(value)}`)
  return `{ ${parts.join(', ')} }`
}

function toJsLiteral(value: unknown): string {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (typeof value === 'string') {
    const hasExpression = /\$\{.*?\}/.test(value)
    const hasNewline = /\r?\n/.test(value)
    if (hasExpression || hasNewline) {
      const escaped = value.replace(/\\/g, '\\\\').replace(/`/g, '\\`')
      return '`' + escaped + '`'
    }
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => toJsLiteral(v)).join(', ')}]`
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => `${JSON.stringify(k)}: ${toJsLiteral(v)}`)
      .join(', ')
    return `{ ${entries} }`
  }
  return JSON.stringify(value)
}
