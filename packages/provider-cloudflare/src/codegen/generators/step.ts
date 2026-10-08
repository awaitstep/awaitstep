import type { WorkflowNode, StepConfig, RetryBackoff } from '@awaitstep/ir'
import { stepLabel, indent, type GenerateMode, type GenerationContext } from '@awaitstep/codegen'
import { generateStepConfig } from './config.js'
import { extractImports } from '../imports.js'

/**
 * Builds a StepConfig from node.data fields (retryLimit, retryDelay, backoff, timeout).
 * The config panel saves these to node.data via configSchema, but codegen
 * needs them as a StepConfig object.
 */
function resolveStepConfig(node: WorkflowNode): StepConfig | undefined {
  if (node.config) return node.config

  const { retryLimit, retryDelay, backoff, timeout } = node.data
  const hasRetry = retryLimit !== undefined || retryDelay !== undefined
  const hasTimeout = timeout !== undefined && timeout !== ''

  if (!hasRetry && !hasTimeout) return undefined

  const config: StepConfig = {}

  if (hasRetry) {
    config.retries = {
      limit: typeof retryLimit === 'number' ? retryLimit : 5,
      delay: typeof retryDelay === 'string' && retryDelay ? retryDelay : '10 seconds',
    }
    if (backoff && typeof backoff === 'string') {
      config.retries.backoff = backoff as RetryBackoff
    }
  }

  if (hasTimeout && typeof timeout === 'string') {
    config.timeout = timeout
  }

  return config
}

export function generateStep(
  node: WorkflowNode,
  ctx: GenerationContext,
  mode: GenerateMode = 'workflow',
): string {
  const code = String(node.data.code ?? '')
  // Inline steps (and script mode) emit raw user code with no wrapping.
  // The user owns the surrounding scope: they can mutate enclosing `let`s,
  // declare local vars, and add their own IIFE if they want one. To share a
  // value with downstream nodes, declare `const X = ...` matching the
  // sanitized node id.
  if (mode === 'script' || node.data.inline === true) {
    return code
  }
  const hasReturn = /\breturn\b/.test(code)
  const prefix = hasReturn ? `const ${ctx.varName(node.id)} = ` : ''
  const config = generateStepConfig(resolveStepConfig(node))
  const configArg = config ? `, ${config}` : ''

  if (ctx.emitModules) {
    return emitStepModule(node, ctx, code, prefix, configArg)
  }

  return `${prefix}await step.do("${stepLabel(node)}"${configArg}, async () => {
  ${code}
});`
}

/**
 * Module mode: the step body becomes its own file with explicit
 * `{ env, event, inputs, step }` parameters — user code runs untouched (no
 * `env.` → `this.env.` regex rewriting), and upstream step results arrive
 * as `inputs`, destructured back to the bare names user code references.
 *
 * `inputs` carries exactly the upstream vars the resolved code mentions as
 * whole words. That set is lexically in scope at the callsite by
 * construction: code referencing an out-of-scope var was already broken
 * when inlined.
 */
function emitStepModule(
  node: WorkflowNode,
  ctx: GenerationContext,
  code: string,
  prefix: string,
  configArg: string,
): string {
  const varName = ctx.varName(node.id)
  const referenced = ctx
    .upstreamVars(node.id)
    .filter((upstreamVar) => new RegExp(`\\b${upstreamVar}\\b`).test(code))

  const { imports, body } = extractImports(code)
  const importBlock = imports.length > 0 ? imports.join('\n') + '\n\n' : ''
  const destructure =
    referenced.length > 0 ? `  const { ${referenced.join(', ')} } = inputs;\n` : ''
  // Comment context, not string context: neutralize `*/` so a node name can
  // never terminate the JSDoc block and leak tokens into module scope.
  const commentName = node.name.replace(/\*\//g, '*\\/')
  const moduleSource = `${importBlock}/** Step "${commentName}" — generated from the workflow node. */
export default async function ${varName}_step({ env, event, inputs, step }) {
${destructure}${indent(body.trim(), 2)}
}
`
  ctx.addFile({ path: `nodes/${varName}.ts`, source: moduleSource, role: 'module' })

  const inputsArg = referenced.length > 0 ? `{ ${referenced.join(', ')} }` : '{}'
  // `this.env` is written literally: the callsite lives inside the workflow
  // class body, and the emitter's legacy env-rewrite regex only touches
  // `env.` member access, which never appears here.
  // `step` is forwarded so code that nested `step.do`/`step.sleep` calls
  // inside a node keeps working — inline mode had it lexically in scope.
  return `${prefix}await step.do("${stepLabel(node)}"${configArg}, () => $${varName}({ env: this.env, event, inputs: ${inputsArg}, step }));`
}
