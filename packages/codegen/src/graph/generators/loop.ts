import type { WorkflowIR, WorkflowNode } from '@awaitstep/ir'
import {
  LOOP_COUNTER_VAR,
  blockChain,
  childContext,
  containerArms,
  loopBindings,
  moduleInputReads,
  stepLabel,
  type GenerateMode,
  type GenerationContext,
} from '../internal.js'
import { collectChain } from './branch.js'
import { enterLoop, exitLoop } from './break.js'
import { groupChain } from '../coalesce.js'
import { nodeYieldsValue } from '../export-plan.js'
import { generateStepGroup } from './step.js'
import { prepareContainerContext, indentCode } from './container-utils.js'

// Pre-compiled regex for step name suffixing (hot path in large workflows)
const STEP_NAME_RE = /flow\.(step|sleep|sleepUntil|waitForEvent)\("([^"]+)"/g
// Non-global: `.test` on a global regex advances `lastIndex`, so a second loop
// in the same workflow could see the body as having no step calls at all.
const STEP_CALL_RE = /flow\.(step|sleep|sleepUntil|waitForEvent)\("/

function suffixStepNames(code: string, counterVar: string): string {
  return code.replace(
    STEP_NAME_RE,
    (_, method, name) => `flow.${method}(\`${name} [\${${counterVar}}]\``,
  )
}

export function generateLoop(
  node: WorkflowNode,
  ir: WorkflowIR,
  ctx: GenerationContext,
  generateNode: (node: WorkflowNode, ir: WorkflowIR, ctx?: GenerationContext) => string,
  mode: GenerateMode = 'workflow',
): string {
  const containers = prepareContainerContext(ir)

  const bodyEdge = ir.edges.find((e) => e.source === node.id && e.label === 'body')
  const bodyChain = bodyEdge
    ? collectChain(
        bodyEdge.target,
        containers.adj,
        containers.inDegree,
        containers.nodeMap,
        containers.edgeLabels,
      )
    : []

  const loopType = node.data.loopType as string
  const counterVar = LOOP_COUNTER_VAR
  const itemVar = String(node.data.itemVar ?? 'item')
  const arms = containerArms(ir)
  const underLoop = ir.nodes.filter((candidate) =>
    blockChain(arms, candidate.id).some((block) => block.owner === node.id),
  )

  // A body step is a module: it reads the item and the index as `inputs`,
  // and whatever it returns becomes the loop's value (the last one wins).
  const bodyCtx = childContext(ctx, loopBindings(node))
  enterLoop()
  // Loop bodies multiply step cost by iteration count, so adjacent
  // config-less steps coalesce here too (script mode has no steps to merge).
  const groups = mode === 'workflow' ? groupChain(bodyChain, ir) : bodyChain.map((n) => [n])
  const parts: string[] = []
  for (const group of groups) {
    parts.push(
      group.length > 1 ? generateStepGroup(group, bodyCtx) : generateNode(group[0]!, ir, bodyCtx),
    )
    for (const member of group) {
      if (member.type !== 'step' || !nodeYieldsValue(ir, member, arms)) continue
      const varName = ctx.varName(member.id)
      parts.push(`if (${varName} !== undefined) _output = ${varName};`)
    }
  }
  exitLoop()
  const rawBody = parts.join('\n')

  // Step-name suffixing only matters when the body actually contains
  // flow.step/flow.sleep/etc calls — i.e. workflow mode with durable nodes
  // inside the loop. The index is also emitted when a body module reads it.
  const needsStepCounter = mode === 'workflow' && STEP_CALL_RE.test(rawBody)
  const readsIndex = underLoop.some((candidate) => {
    if (candidate.type !== 'step') return false
    const reads = moduleInputReads(String(candidate.data.code ?? ''))
    return reads.all || reads.names.has('index')
  })
  const needsCounter = needsStepCounter || readsIndex
  const bodyCode = needsStepCounter ? suffixStepNames(rawBody, counterVar) : rawBody
  const indentedBody = indentCode(bodyCode, 4)
  const hasBody = indentedBody.trim().length > 0
  const usesOutput = nodeYieldsValue(ir, node, arms)

  const loopLines: string[] = []

  switch (loopType) {
    case 'forEach': {
      const collection = String(node.data.collection ?? '[]')
      // forEach already provides the item via destructuring. Only when the
      // body has step.METHOD calls, or a module reads `inputs.index`, do we
      // also need an iteration index — and then we get it from .entries()
      // inline, not from a separate counter declaration.
      if (needsCounter) {
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
      // it's actually used: to suffix step names, or read by a module.
      if (needsCounter) loopLines.push(`  let ${counterVar} = 0;`)
      loopLines.push(`  while (${whileExpr}) {`)
      if (hasBody) loopLines.push(indentedBody)
      if (needsCounter) loopLines.push(`    ${counterVar}++;`)
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
      // The body's returns land in `_output`; an IIFE scopes it and hands
      // the value to a `const X = ...` the export pass can see.
      return `const ${ctx.varName(node.id)} = await (async () => {
  let _output; // the last value a body step returned
${loopLines.join('\n')}
  return _output;
})();`
    }
    // No output capture — emit the bare loop, no IIFE.
    return loopLines.map((l) => l.replace(/^ {2}/, '')).join('\n')
  }

  // Workflow mode: keep the durable wrapper. The IIFE-style closure is
  // required by the step signature. Always include _output declaration
  // and return so the captured value (if any) flows out via const prefix.
  const prefix = usesOutput ? `const ${ctx.varName(node.id)} = ` : ''
  return `${prefix}await flow.step("${stepLabel(node)}", async (ctx) => {
  let _output; // the last value a body step returned
${loopLines.join('\n')}
  return _output;
});`
}
