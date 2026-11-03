import type { WorkflowNode, StepConfig, RetryBackoff } from '@awaitstep/ir'
import { stepLabel, indent, type GenerateMode, type GenerationContext } from '@awaitstep/codegen'
import { generateStepConfig } from './config.js'
import { extractImports } from '../imports.js'

/**
 * Builds a StepConfig from node.data fields (retryLimit, retryDelay, backoff, timeout).
 * The config panel saves these to node.data via configSchema, but codegen
 * needs them as a StepConfig object.
 */
export function resolveStepConfig(node: WorkflowNode): StepConfig | undefined {
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
  // Lean stored state: an unconsumed return is swallowed so Cloudflare
  // stores no step state for it — only when the emitter's consumption
  // analysis explicitly says nothing reads it (absent analysis = store).
  // Short-circuit on hasReturn: the analysis is pointless for returnless code.
  const lean = hasReturn && !(ctx.isOutputConsumed?.(node.id) ?? true)
  const prefix = hasReturn && !lean ? `const ${ctx.varName(node.id)} = ` : ''
  const config = generateStepConfig(resolveStepConfig(node))
  const configArg = config ? `, ${config}` : ''

  if (ctx.emitModules) {
    return emitStepModule(node, ctx, code, prefix, configArg, lean)
  }

  if (lean) {
    // The nested arrow gives user code its own scope, so a body declaring
    // `ctx` shadows the attempt instead of colliding with it.
    return `await flow.step("${stepLabel(node)}"${configArg}, async (ctx) => {
  await (async () => {
${indent(code, 4)}
  })();
});`
  }

  return `${prefix}await flow.step("${stepLabel(node)}"${configArg}, async (ctx) => {
  return await (async () => {
${indent(code, 4)}
  })();
});`
}

/**
 * Module mode: the step body becomes its own file with explicit
 * `{ env, event, inputs, step, ctx }` parameters — user code runs untouched,
 * upstream step results arrive as `inputs` (destructured back to the bare
 * names the user code references), `step` is the durable-step adapter and
 * `ctx` is the current attempt.
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
  lean = false,
): string {
  const { varName, call } = emitModuleFile(node, ctx, code)
  if (lean) {
    // Braced body discards the module's return value: nothing is stored.
    return `await flow.step("${stepLabel(node)}"${configArg}, async (ctx) => { await $${varName}(${call}); });`
  }
  return `${prefix}await flow.step("${stepLabel(node)}"${configArg}, (ctx) => $${varName}(${call}));`
}

function emitModuleFile(
  node: WorkflowNode,
  ctx: GenerationContext,
  code: string,
): { varName: string; call: string } {
  const varName = ctx.varName(node.id)
  const referenced = ctx
    .upstreamVars(node.id)
    .filter((upstreamVar) => new RegExp(`\\b${upstreamVar}\\b`).test(code))

  const { imports, body } = extractImports(code)
  const importBlock = imports.length > 0 ? imports.join('\n') + '\n\n' : ''
  // The body gets its own nested scope so a body that declares `ctx` (or an
  // upstream var with that name) shadows the attempt instead of colliding
  // with the parameter. A `return` in the body is the step's value.
  const inner =
    (referenced.length > 0 ? `const { ${referenced.join(', ')} } = inputs;\n` : '') + body.trim()
  // Comment context, not string context: neutralize `*/` so a node name can
  // never terminate the JSDoc block and leak tokens into module scope.
  const commentName = node.name.replace(/\*\//g, '*\\/')
  const moduleSource = `${importBlock}/** Step "${commentName}" — generated from the workflow node. */
export default async function ${varName}_step({ env, event, inputs, step, ctx }) {
  return await (async () => {
${indent(inner, 4)}
  })();
}
`
  ctx.addFile({ path: `nodes/${varName}.ts`, source: moduleSource, role: 'module' })

  const inputsArg = referenced.length > 0 ? `{ ${referenced.join(', ')} }` : '{}'
  // `env`, `event` and `step` are the aliases the entry's `run` establishes;
  // `ctx` is the callback's attempt, which makes the documented
  // `ctx.attempt` real inside step code.
  return { varName, call: `{ env, event, inputs: ${inputsArg}, step, ctx }` }
}

/**
 * Emits a run of adjacent config-less step nodes as ONE durable step —
 * Cloudflare bills per durable step, so a linear chain of plain steps costs one
 * step instead of N. The group runs under the first node's label; member
 * results are declared inside the callback (keeping intra-group references
 * working) and returned as an object the callsite destructures, so
 * downstream nodes reference the same vars as in uncoalesced output.
 */
export function generateStepGroup(
  nodes: WorkflowNode[],
  ctx: GenerationContext,
  options?: { includeInReturn?: (nodeId: string) => boolean },
): string {
  const members = nodes.map((node) => {
    const code = String(node.data.code ?? '')
    const hasReturn = /\breturn\b/.test(code)
    const varName = ctx.varName(node.id)
    let stmt: string
    if (ctx.emitModules) {
      const emitted = emitModuleFile(node, ctx, code)
      const call = `await $${emitted.varName}(${emitted.call});`
      stmt = hasReturn ? `const ${varName} = ${call}` : call
    } else {
      // Per-member async IIFE: isolates local declarations between members
      // and gives each body its own `return` scope.
      const iife = `await (async () => {\n${indent(code, 2)}\n})();`
      stmt = hasReturn ? `const ${varName} = ${iife}` : iife
    }
    // The callback-local const stays for intra-group references; only
    // membership in the stored return object is subject to lean analysis.
    const include = options?.includeInReturn?.(node.id) ?? true
    return { stmt, returnsVar: hasReturn && include ? varName : undefined }
  })

  const returned = members.map((m) => m.returnsVar).filter((v): v is string => v !== undefined)
  const body = members.map((m) => m.stmt).join('\n')
  const ret = returned.length > 0 ? `\n  return { ${returned.join(', ')} };` : ''
  const prefix = returned.length > 0 ? `const { ${returned.join(', ')} } = ` : ''
  return `${prefix}await flow.step("${stepLabel(nodes[0]!)}", async (ctx) => {
${indent(body, 2)}${ret}
});`
}
