import type { WorkflowNode } from '@awaitstep/ir'
import { varName, escName } from '@awaitstep/codegen'
import { generateStepConfig } from './config.js'

export function generateHttp(node: WorkflowNode): string {
  const method = String(node.data.method ?? 'GET')
  const url = String(node.data.url ?? '')
  const headers = node.data.headers as Record<string, string> | undefined
  const body = node.data.body as string | undefined

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
    fetchOptions.push(`body: ${body}`)
  }

  const needsOptions = method !== 'GET' || fetchOptions.length > 1
  const fetchOpts = needsOptions ? `, { ${fetchOptions.join(', ')} }` : ''
  const urlLiteral = toStringLiteral(url)

  return `const ${varName(node.id)} = await step.do("${escName(node.name)}"${configArg}, async () => {
  const response = await fetch(${urlLiteral}${fetchOpts});
  return response.json();
});`
}

function toStringLiteral(value: string): string {
  const hasExpression = /\$\{.*?\}/.test(value)
  const hasNewline = /\r?\n/.test(value)

  if (hasExpression || hasNewline) {
    // Template literal: escape backticks and literal backslashes
    const escaped = value.replace(/\\/g, '\\\\').replace(/`/g, '\\`')
    return '`' + escaped + '`'
  }
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}
