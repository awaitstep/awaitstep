import type { WorkflowNode } from '@awaitstep/ir'
import { stepLabel, type GenerateMode, type GenerationContext } from '../internal.js'
import { generateStepConfig } from './config.js'
import { isJsonLiteralBody } from './http-body.js'

export function generateHttp(
  node: WorkflowNode,
  ctx: GenerationContext,
  mode: GenerateMode = 'workflow',
): string {
  const method = String(node.data.method ?? 'GET')
  const url = String(node.data.url ?? '')
  const rawHeaders = node.data.headers
  const headers =
    rawHeaders && typeof rawHeaders === 'object' && !Array.isArray(rawHeaders)
      ? (rawHeaders as Record<string, string>)
      : undefined
  const body = node.data.body
  const rawQueryParams = node.data.queryParams
  const queryParams =
    rawQueryParams && typeof rawQueryParams === 'object' && !Array.isArray(rawQueryParams)
      ? (rawQueryParams as Record<string, string>)
      : undefined

  const config = generateStepConfig(node.config)
  const configArg = config ? `, ${config}` : ''

  const fetchOptions: string[] = [`method: ${JSON.stringify(method)}`]

  // Off-schema rows can hold a non-string Body (save does not run the strict
  // schema); those are emitted as before rather than scanned. A non-literal
  // Body keeps its whitespace: a trailing line comment needs its newline.
  const bodyExpression = typeof body === 'string' ? body : body ? String(body) : ''
  const jsonBody = typeof body === 'string' && isJsonLiteralBody(body)

  const headerEntries = Object.entries(headers ?? {}).map(
    ([k, v]) => `${JSON.stringify(k)}: ${toJsLiteral(v)}`,
  )
  if (jsonBody && !hasContentType(headers)) {
    headerEntries.push('"Content-Type": "application/json"')
  }
  if (headerEntries.length > 0) {
    fetchOptions.push(`headers: { ${headerEntries.join(', ')} }`)
  }

  if (jsonBody) {
    fetchOptions.push(`body: JSON.stringify(${bodyExpression.trim()})`)
  } else if (bodyExpression.trim()) {
    fetchOptions.push(`body: ${bodyExpression}`)
  }

  const hasQueryParams = queryParams && Object.keys(queryParams).length > 0
  const needsOptions = method !== 'GET' || fetchOptions.length > 1
  const fetchOpts = needsOptions ? `, { ${fetchOptions.join(', ')} }` : ''

  const lines: string[] = []

  if (hasQueryParams) {
    const urlLiteral = toJsLiteral(url)
    lines.push(`const url = new URL(${urlLiteral});`)
    for (const [k, v] of Object.entries(queryParams)) {
      lines.push(`url.searchParams.set(${JSON.stringify(k)}, ${toJsLiteral(v)});`)
    }
    lines.push(`const response = await fetch(url${fetchOpts});`)
  } else {
    const urlLiteral = toJsLiteral(url)
    lines.push(`const response = await fetch(${urlLiteral}${fetchOpts});`)
  }

  lines.push('return response.json();')

  const bodyCode = lines.map((l) => `  ${l}`).join('\n')

  if (mode === 'script') {
    // No `step.do` boundary in script mode, so emit the body inline. The
    // simple no-queryparams case collapses to a single expression. With
    // queryparams the URL builder needs intermediate vars — namespace them
    // by node id so siblings don't collide, and keep the final assignment
    // as `const ${ctx.varName(node.id)} = ...` so the EXPORT_ post-processing
    // (which scans for `const X =`) still finds it.
    if (!hasQueryParams) {
      const urlLiteral = toJsLiteral(url)
      return `const ${ctx.varName(node.id)} = await fetch(${urlLiteral}${fetchOpts}).then(r => r.json());`
    }
    const v = ctx.varName(node.id)
    const urlLiteral = toJsLiteral(url)
    const scriptLines: string[] = [`const _${v}_url = new URL(${urlLiteral});`]
    for (const [k, qv] of Object.entries(queryParams)) {
      scriptLines.push(`_${v}_url.searchParams.set(${JSON.stringify(k)}, ${toJsLiteral(qv)});`)
    }
    scriptLines.push(`const ${v} = await fetch(_${v}_url${fetchOpts}).then(r => r.json());`)
    return scriptLines.join('\n')
  }
  return `const ${ctx.varName(node.id)} = await flow.step("${stepLabel(node)}"${configArg}, async () => {
${bodyCode}
});`
}

function hasContentType(headers: Record<string, string> | undefined): boolean {
  return Object.keys(headers ?? {}).some((k) => k.toLowerCase() === 'content-type')
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
