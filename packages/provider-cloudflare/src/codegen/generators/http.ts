import type { WorkflowNode } from '@awaitstep/ir'
import { varName, escName } from '@awaitstep/codegen'
import { generateStepConfig } from './config.js'

export function generateHttp(node: WorkflowNode): string {
  const method = String(node.data.method ?? 'GET')
  const url = String(node.data.url ?? '')
  const rawHeaders = node.data.headers
  const headers =
    rawHeaders && typeof rawHeaders === 'object' && !Array.isArray(rawHeaders)
      ? (rawHeaders as Record<string, string>)
      : undefined
  const body = node.data.body as string | undefined
  const rawQueryParams = node.data.queryParams
  const queryParams =
    rawQueryParams && typeof rawQueryParams === 'object' && !Array.isArray(rawQueryParams)
      ? (rawQueryParams as Record<string, string>)
      : undefined

  const config = generateStepConfig(node.config)
  const configArg = config ? `, ${config}` : ''

  const fetchOptions: string[] = [`method: "${method}"`]

  if (headers && Object.keys(headers).length > 0) {
    const headerEntries = Object.entries(headers)
      .map(([k, v]) => `"${k}": ${toStringLiteral(v)}`)
      .join(', ')
    fetchOptions.push(`headers: { ${headerEntries} }`)
  }

  if (body) {
    const trimmed = body.trim()
    const isAlreadyStringified = trimmed.startsWith('JSON.stringify')
    const isStringLiteral = /^["'`]/.test(trimmed)
    if (isAlreadyStringified || isStringLiteral) {
      fetchOptions.push(`body: ${body}`)
    } else {
      fetchOptions.push(`body: JSON.stringify(${body})`)
    }
  }

  const hasQueryParams = queryParams && Object.keys(queryParams).length > 0
  const needsOptions = method !== 'GET' || fetchOptions.length > 1
  const fetchOpts = needsOptions ? `, { ${fetchOptions.join(', ')} }` : ''

  const lines: string[] = []

  if (hasQueryParams) {
    const urlLiteral = toStringLiteral(url)
    lines.push(`const url = new URL(${urlLiteral});`)
    for (const [k, v] of Object.entries(queryParams)) {
      lines.push(`url.searchParams.set("${k}", ${toStringLiteral(v)});`)
    }
    lines.push(`const response = await fetch(url${fetchOpts});`)
  } else {
    const urlLiteral = toStringLiteral(url)
    lines.push(`const response = await fetch(${urlLiteral}${fetchOpts});`)
  }

  lines.push('return response.json();')

  const bodyCode = lines.map((l) => `  ${l}`).join('\n')

  return `const ${varName(node.id)} = await step.do("${escName(node.name)}"${configArg}, async () => {
${bodyCode}
});`
}

function toStringLiteral(value: unknown): string {
  if (typeof value !== 'string') return JSON.stringify(value)
  const hasExpression = /\$\{.*?\}/.test(value)
  const hasNewline = /\r?\n/.test(value)

  if (hasExpression || hasNewline) {
    // Template literal: escape backticks and literal backslashes
    const escaped = value.replace(/\\/g, '\\\\').replace(/`/g, '\\`')
    return '`' + escaped + '`'
  }
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}
