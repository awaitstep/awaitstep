import type { WorkflowNode } from '@awaitstep/ir'
import { varName, escName, type GenerateMode } from '@awaitstep/codegen'
import { generateStepConfig } from './config.js'

/**
 * Generates code for a `sub_script` node: an HTTP-shaped call to another
 * deployed Worker via a Cloudflare service binding (`env.<BINDING>.fetch(...)`).
 *
 * Same datacenter, no public network round-trip. The called worker's `fetch()`
 * handler runs and returns a Response; we parse it as JSON and bind the result
 * to the node's variable name.
 *
 * In workflow mode, the call is wrapped in `step.do(...)` for durability +
 * retries. In script mode, it's a bare `await env.X.fetch(...).then(r => r.json())`.
 */
export function generateSubScript(node: WorkflowNode, mode: GenerateMode = 'workflow'): string {
  const workerName = String(node.data.workerName ?? '')
  const binding = workerNameToBinding(workerName)
  const method = String(node.data.method ?? 'POST')
  const url = String(node.data.url ?? 'https://invoke/')
  const rawHeaders = node.data.headers
  const headers =
    rawHeaders && typeof rawHeaders === 'object' && !Array.isArray(rawHeaders)
      ? (rawHeaders as Record<string, string>)
      : undefined
  const body = node.data.body as string | undefined

  const config = generateStepConfig(node.config)
  const configArg = config ? `, ${config}` : ''

  const fetchOptions: string[] = [`method: "${method}"`]

  if (headers && Object.keys(headers).length > 0) {
    const headerEntries = Object.entries(headers)
      .map(([k, v]) => `"${k}": ${toJsLiteral(v)}`)
      .join(', ')
    fetchOptions.push(`headers: { ${headerEntries} }`)
  }

  if (body && body.trim().length > 0) {
    // User wrote a JS expression for the body. Wrap with JSON.stringify if it
    // doesn't already look like a string/Request body. Conservative: assume
    // it's a value and stringify; users who pass a string explicitly can wrap
    // their expression with String(...) to bypass.
    fetchOptions.push(`body: typeof (${body}) === "string" ? (${body}) : JSON.stringify(${body})`)
  }

  const urlLiteral = toJsLiteral(url)
  const fetchOpts = fetchOptions.length > 0 ? `, { ${fetchOptions.join(', ')} }` : ''

  if (mode === 'script') {
    return `const ${varName(node.id)} = await env.${binding}.fetch(${urlLiteral}${fetchOpts}).then(r => r.json());`
  }
  return `const ${varName(node.id)} = await step.do("${escName(node.name)}"${configArg}, async () => {
  const response = await env.${binding}.fetch(${urlLiteral}${fetchOpts});
  return response.json();
});`
}

export interface SubScriptBinding {
  /** Env binding name, e.g. MY_SCRIPT */
  binding: string
  /** The user-provided deployed worker name */
  service: string
}

/**
 * Convert a deployed worker name (e.g. `awaitstep-my-script` or `my-worker`)
 * to an UPPER_SNAKE_CASE env binding identifier (`MY_SCRIPT`, `MY_WORKER`).
 *
 * Strips a leading `awaitstep-` prefix when present so generated names stay
 * readable; all hyphens become underscores; non-identifier chars are replaced
 * with underscores. Falls back to the raw name uppercased if stripping yields
 * an empty string.
 */
export function workerNameToBinding(workerName: string): string {
  if (!workerName) return ''
  const stripped = workerName.replace(/^awaitstep-/i, '')
  const base = stripped.length > 0 ? stripped : workerName
  return base
    .replace(/[^A-Za-z0-9_]/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase()
}

/**
 * Collects unique service-binding entries from all `sub_script` nodes in the
 * IR. Returns one binding per unique workerName so duplicates (multiple calls
 * to the same script) collapse into one wrangler.json `services[]` entry.
 */
export function getSubScriptBindings(
  nodes: readonly { type: string; data: Record<string, unknown> }[],
): SubScriptBinding[] {
  const seen = new Set<string>()
  const bindings: SubScriptBinding[] = []
  for (const node of nodes) {
    if (node.type !== 'sub_script') continue
    const workerName = String(node.data.workerName ?? '')
    if (!workerName) continue
    const binding = workerNameToBinding(workerName)
    if (!binding || seen.has(binding)) continue
    seen.add(binding)
    bindings.push({ binding, service: workerName })
  }
  return bindings
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
      .map(([k, v]) => `"${k}": ${toJsLiteral(v)}`)
      .join(', ')
    return `{ ${entries} }`
  }
  return JSON.stringify(value)
}
