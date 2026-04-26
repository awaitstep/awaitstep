import type { WorkflowIR, WorkflowNode } from '@awaitstep/ir'
import { varName, escName, type GenerateMode } from '@awaitstep/codegen'
import { collectChain } from './branch.js'
import { enterLoop, exitLoop } from './break.js'
import { prepareContainerContext, indentCode } from './container-utils.js'

// Pre-compiled regex for step name suffixing (hot path in large workflows)
const STEP_NAME_RE = /step\.(do|sleep|sleepUntil|waitForEvent)\("([^"]+)"/g

const COMMENT_RE = /\/\/.*$/gm
const OUTPUT_ASSIGN_RE = /\b_output\s*=/

function suffixStepNames(code: string, counterVar: string): string {
  return code.replace(
    STEP_NAME_RE,
    (_, method, name) => `step.${method}(\`${name} [\${${counterVar}}]\``,
  )
}

export function generateLoop(
  node: WorkflowNode,
  ir: WorkflowIR,
  generateNode: (node: WorkflowNode, ir: WorkflowIR) => string,
  mode: GenerateMode = 'workflow',
): string {
  const ctx = prepareContainerContext(ir)

  const bodyEdge = ir.edges.find((e) => e.source === node.id && e.label === 'body')
  const bodyChain = bodyEdge
    ? collectChain(bodyEdge.target, ctx.adj, ctx.inDegree, ctx.nodeMap)
    : []

  const loopType = node.data.loopType as string
  const counterVar = '_loop_i'

  enterLoop()
  const rawBody = bodyChain.map((n) => generateNode(n, ir)).join('\n')
  exitLoop()

  const bodyCode = suffixStepNames(rawBody, counterVar)
  const indentedBody = indentCode(bodyCode, 4)
  const hasBody = indentedBody.trim().length > 0
  const usesOutput = OUTPUT_ASSIGN_RE.test(rawBody.replace(COMMENT_RE, ''))

  const inner: string[] = []
  inner.push('  let _output; // assign a value to return it from the loop')

  switch (loopType) {
    case 'forEach': {
      const collection = String(node.data.collection ?? '[]')
      const itemVar = String(node.data.itemVar ?? 'item')
      inner.push(`  let ${counterVar} = 0;`)
      inner.push(`  for (const ${itemVar} of ${collection}) {`)
      if (hasBody) inner.push(indentedBody)
      inner.push(`    ${counterVar}++;`)
      inner.push('  }')
      break
    }
    case 'while': {
      const condition = String(node.data.condition ?? '').trim()
      const whileExpr = condition || 'true'
      inner.push(`  let ${counterVar} = 0;`)
      inner.push(`  while (${whileExpr}) {`)
      if (hasBody) inner.push(indentedBody)
      inner.push(`    ${counterVar}++;`)
      inner.push('  }')
      break
    }
    case 'times': {
      const count = (node.data.count as number) ?? 5
      inner.push(`  for (let ${counterVar} = 0; ${counterVar} < ${count}; ${counterVar}++) {`)
      if (hasBody) inner.push(indentedBody)
      inner.push('  }')
      break
    }
    default:
      inner.push(`  // Unknown loop type: ${loopType}`)
  }

  inner.push('  return _output;')

  const prefix = usesOutput ? `const ${varName(node.id)} = ` : ''
  if (mode === 'script') {
    return `${prefix}await (async () => {
${inner.join('\n')}
})();`
  }
  return `${prefix}await step.do("${escName(node.name)}", async () => {
${inner.join('\n')}
});`
}
