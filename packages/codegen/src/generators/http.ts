import type { HttpRequestNode } from '@awaitstep/ir'
import { generateStepConfig } from './config.js'

export function generateHttp(node: HttpRequestNode): string {
  const config = generateStepConfig(node.config)
  const configArg = config ? `, ${config}` : ''

  const fetchOptions: string[] = [`method: "${node.method}"`]

  if (node.headers && Object.keys(node.headers).length > 0) {
    const headers = Object.entries(node.headers)
      .map(([k, v]) => `"${k}": "${v}"`)
      .join(', ')
    fetchOptions.push(`headers: { ${headers} }`)
  }

  if (node.body) {
    fetchOptions.push(`body: ${JSON.stringify(node.body)}`)
  }

  const fetchOpts = fetchOptions.length > 1 ? `, { ${fetchOptions.join(', ')} }` : ''

  return `const ${varName(node.id)} = await step.do("${escName(node.name)}"${configArg}, async () => {
  const response = await fetch("${node.url}"${fetchOpts});
  return response.json();
});`
}

function varName(id: string): string {
  return id.replace(/[^a-zA-Z0-9_]/g, '_')
}

function escName(name: string): string {
  return name.replace(/"/g, '\\"')
}
