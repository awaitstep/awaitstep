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

  // Step-name suffixing only matters when the body actually contains
  // step.do/step.sleep/etc calls — i.e. workflow mode with durable nodes
  // inside the loop. In script mode the body is raw inline code, no step
  // primitives, no suffixing needed.
  const needsStepCounter = mode === 'workflow' && STEP_NAME_RE.test(rawBody)
  const bodyCode = needsStepCounter ? suffixStepNames(rawBody, counterVar) : rawBody
  const indentedBody = indentCode(bodyCode, 4)
  const hasBody = indentedBody.trim().length > 0
  const usesOutput = OUTPUT_ASSIGN_RE.test(rawBody.replace(COMMENT_RE, ''))

  const loopLines: string[] = []

  switch (loopType) {
    case 'forEach': {
      const collection = String(node.data.collection ?? '[]')
      const itemVar = String(node.data.itemVar ?? 'item')
      // forEach already provides the item via destructuring. Only when the
      // body has step.METHOD calls do we also need an iteration index for
      // unique step names — and then we get it from .entries() inline,
      // not from a separate counter declaration.
      if (needsStepCounter) {
        loopLines.push(`  for (const [${counterVar}, ${itemVar}] of (${collection}).entries()) {`)
      } else {
        loopLines.push(`  for (const ${itemVar} of ${collection}) {`)
      }
      if (hasBody) loopLines.push(indentedBody)
      loopLines.push('  }')
      break
    }
    case 'while': {
      const condition = String(node.data.condition ?? '').trim()
      const whileExpr = condition || 'true'
      // While loops have no inherent index. Only emit the counter when
      // it's actually used to suffix step names.
      if (needsStepCounter) loopLines.push(`  let ${counterVar} = 0;`)
      loopLines.push(`  while (${whileExpr}) {`)
      if (hasBody) loopLines.push(indentedBody)
      if (needsStepCounter) loopLines.push(`    ${counterVar}++;`)
      loopLines.push('  }')
      break
    }
    case 'times': {
      const count = (node.data.count as number) ?? 5
      // The counter IS the loop iterator — always emitted.
      loopLines.push(`  for (let ${counterVar} = 0; ${counterVar} < ${count}; ${counterVar}++) {`)
      if (hasBody) loopLines.push(indentedBody)
      loopLines.push('  }')
      break
    }
    default:
      loopLines.push(`  // Unknown loop type: ${loopType}`)
  }

  if (mode === 'script') {
    // Script mode: no step.do boundary, so emit the loop inline.
    if (usesOutput) {
      // Need to capture the body's _output assignment as a const. Wrap
      // in an IIFE — that's the cheapest way to scope `let _output` and
      // return its value into a `const X = ...` (which the EXPORT_
      // post-processing in generateScript scans for).
      return `const ${varName(node.id)} = await (async () => {
  let _output; // assign a value to return it from the loop
${loopLines.join('\n')}
  return _output;
})();`
    }
    // No output capture — emit the bare loop, no IIFE.
    return loopLines.map((l) => l.replace(/^ {2}/, '')).join('\n')
  }

  // Workflow mode: keep the step.do wrapper. The IIFE-style closure is
  // required by step.do's signature. Always include _output declaration
  // and return so the captured value (if any) flows out via const prefix.
  const prefix = usesOutput ? `const ${varName(node.id)} = ` : ''
  return `${prefix}await step.do("${escName(node.name)}", async () => {
  let _output; // assign a value to return it from the loop
${loopLines.join('\n')}
  return _output;
});`
}
