import type { StepNode } from '@awaitstep/ir'
import { varName, escName } from '@awaitstep/codegen'
import { generateStepConfig } from './config.js'

export function generateStep(node: StepNode): string {
  const config = generateStepConfig(node.config)
  const configArg = config ? `, ${config}` : ''
  const hasReturn = /\breturn\b/.test(node.code)
  const prefix = hasReturn ? `const ${varName(node.id)} = ` : ''
  return `${prefix}await step.do("${escName(node.name)}"${configArg}, async () => {
  ${node.code}
});`
}
