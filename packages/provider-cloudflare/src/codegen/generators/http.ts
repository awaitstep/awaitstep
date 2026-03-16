import type { HttpRequestNode } from '@awaitstep/ir'
import { varName, escName } from '@awaitstep/codegen'
import { generateStepConfig } from './config.js'

export function generateHttp(node: HttpRequestNode): string {
  const config = generateStepConfig(node.config)
  const configArg = config ? `, ${config}` : ''

  const fetchOptions: string[] = [`method: "${node.method}"`]

  if (node.headers && Object.keys(node.headers).length > 0) {
    const headers = Object.entries(node.headers)
      .map(([k, v]) => `"${k}": ${toStringLiteral(v)}`)
      .join(', ')
    fetchOptions.push(`headers: { ${headers} }`)
  }

  if (node.body) {
    fetchOptions.push(`body: ${toStringLiteral(node.body)}`)
  }

  const needsOptions = node.method !== 'GET' || fetchOptions.length > 1
  const fetchOpts = needsOptions ? `, { ${fetchOptions.join(', ')} }` : ''
  const urlLiteral = toStringLiteral(node.url)

  return `const ${varName(node.id)} = await step.do("${escName(node.name)}"${configArg}, async () => {
  const response = await fetch(${urlLiteral}${fetchOpts});
  return response.json();
});`
}

function toStringLiteral(value: string): string {
  if (/\$\{.*?\}/.test(value)) {
    return '`' + value.replace(/`/g, '\\`') + '`'
  }
  return `"${value.replace(/"/g, '\\"')}"`
}
