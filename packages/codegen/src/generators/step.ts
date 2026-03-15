import type { StepNode } from '@awaitstep/ir'
import { generateStepConfig } from './config.js'

export function generateStep(node: StepNode): string {
  const config = generateStepConfig(node.config)
  const configArg = config ? `, ${config}` : ''
  return `const ${varName(node.id)} = await step.do("${escName(node.name)}"${configArg}, async () => {
  ${node.code}
});`
}

function varName(id: string): string {
  return id.replace(/[^a-zA-Z0-9_]/g, '_')
}

function escName(name: string): string {
  return name.replace(/"/g, '\\"')
}
