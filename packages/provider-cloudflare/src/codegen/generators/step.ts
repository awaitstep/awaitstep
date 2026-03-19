import type { WorkflowNode } from '@awaitstep/ir'
import { varName, escName } from '@awaitstep/codegen'
import { generateStepConfig } from './config.js'

export function generateStep(node: WorkflowNode): string {
  const code = String(node.data.code ?? '')
  const config = generateStepConfig(node.config)
  const configArg = config ? `, ${config}` : ''
  const hasReturn = /\breturn\b/.test(code)
  const prefix = hasReturn ? `const ${varName(node.id)} = ` : ''
  return `${prefix}await step.do("${escName(node.name)}"${configArg}, async () => {
  ${code}
});`
}
