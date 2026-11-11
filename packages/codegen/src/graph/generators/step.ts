import type { WorkflowNode, StepConfig, RetryBackoff } from '@awaitstep/ir'
import { stepSourcePath } from '@awaitstep/ir'
import {
  GenerateInputError,
  stepLabel,
  indent,
  moduleInputReads,
  normalizeStepModule,
  stepReturnsValue,
  type GenerationContext,
} from '../internal.js'
import { generateStepConfig } from './config.js'

/**
 * Builds a StepConfig from node.data fields (retryLimit, retryDelay, backoff, timeout).
 * The config panel saves these to node.data via configSchema, but codegen
 * needs them as a StepConfig object.
 */
function isDurationSet(value: unknown): boolean {
  return typeof value === 'number' || (typeof value === 'string' && value.trim() !== '')
}

/**
 * The retry policy every durable step carries unless its node says otherwise.
 * Cloudflare's own default is 5 retries 10 seconds apart; AwaitStep opts for
 * a smaller default, and emits it explicitly so the deployed step does not
 * fall back to the runtime's.
 */
export const DEFAULT_STEP_CONFIG: StepConfig = {
  retries: { limit: 2, delay: '5 seconds', backoff: 'exponential' },
}

export function resolveStepConfig(node: WorkflowNode): StepConfig | undefined {
  if (node.config) return node.config

  const { retryLimit, retryDelay, backoff, timeout } = node.data
  // A blank duration is an unset one: the canvas writes '' when a field is
  // cleared, and a whitespace string would reach the deployed step as-is.
  const delaySet = isDurationSet(retryDelay)
  const hasRetry = retryLimit !== undefined || delaySet
  const hasTimeout = isDurationSet(timeout)

  if (!hasRetry && !hasTimeout) return undefined

  const config: StepConfig = {}

  if (hasRetry) {
    config.retries = {
      limit: typeof retryLimit === 'number' ? retryLimit : 2,
      delay: delaySet && typeof retryDelay === 'string' ? retryDelay : '5 seconds',
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

export function generateStep(node: WorkflowNode, ctx: GenerationContext): string {
  // An inline step is raw statements pasted into the surrounding scope — no
  // step boundary, no module. The explicit opt-out.
  if (node.data.inline === true) return String(node.data.code ?? '')

  const { varName, call, hasReturn } = stepModuleCall(node, ctx)
  // Lean stored state: an unconsumed return is swallowed so Cloudflare
  // stores no step state for it — only when the emitter's consumption
  // analysis explicitly says nothing reads it (absent analysis = store).
  const lean = hasReturn && !(ctx.isOutputConsumed?.(node.id) ?? true)
  const prefix = hasReturn && !lean ? `const ${varName} = ` : ''
  const config = generateStepConfig(resolveStepConfig(node) ?? DEFAULT_STEP_CONFIG)
  const configArg = config ? `, ${config}` : ''

  if (lean) {
    // Braced body discards the module's return value: nothing is stored.
    return `await flow.step("${stepLabel(node)}"${configArg}, async (ctx) => { await $${varName}(${call}); });`
  }
  // One line here; the emitter wraps what outgrows the line once the body is
  // final (`wrapModuleCalls`), after any `const` prefix may have been dropped.
  return `${prefix}await flow.step("${stepLabel(node)}"${configArg}, (ctx) => $${varName}(${call}));`
}

/**
 * Adds the step's module to the bundle — the person's code, verbatim, in
 * module form — and returns the call that runs it. `inputs` carries what the
 * module reads from `inputs` and the call site can bind: the upstream vars in
 * scope, and the enclosing container's bindings (`item`, `index`, `error`).
 */
export function stepModuleCall(
  node: WorkflowNode,
  ctx: GenerationContext,
): { varName: string; call: string; hasReturn: boolean } {
  const varName = ctx.varName(node.id)
  const bindings = ctx.blockInputs ?? {}
  const code = normalizeStepModule(
    String(node.data.code ?? ''),
    varName,
    ctx.upstreamVars(node.id),
    bindings,
  )
  // The step's own file: the path never moves on a rename, the binding follows the name.
  const path = stepSourcePath(node.id)
  const binding = `$${varName}`
  const existing = ctx.files.find((file) => file.path === path)
  if (!existing) {
    ctx.addFile({ path, source: code, role: 'module', binding })
  } else if (existing.binding !== binding) {
    // Two ids whose files would coincide (one spelled like the other's
    // rewritten path): the second module would silently never be imported.
    throw new GenerateInputError(
      `Two steps map to the same file ${path} (${existing.binding} and ${binding}) — rename one of them`,
      'provider',
    )
  }
  const reads = moduleInputReads(code)
  const passes = (name: string) => reads.all || reads.names.has(name)
  const entries = new Map<string, string>()
  for (const name of ctx.upstreamVars(node.id)) if (passes(name)) entries.set(name, name)
  // The container's bindings win over an upstream step of the same name, as
  // the nearer scope did when the body was inlined.
  for (const [key, expression] of Object.entries(bindings)) {
    if (passes(key)) entries.set(key, expression)
  }
  const inputsArg =
    entries.size > 0
      ? `{ ${[...entries].map(([key, expr]) => (key === expr ? key : `${key}: ${expr}`)).join(', ')} }`
      : '{}'
  // `env`, `event` and `step` are the aliases the entry's `run` establishes;
  // `ctx` is the callback's attempt, which makes the documented
  // `ctx.attempt` real inside step code.
  return {
    varName,
    call: `{ env, event, inputs: ${inputsArg}, step, ctx }`,
    hasReturn: stepReturnsValue(code),
  }
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
    const { varName, call, hasReturn } = stepModuleCall(node, ctx)
    const stmt = hasReturn
      ? `const ${varName} = await $${varName}(${call});`
      : `await $${varName}(${call});`
    // The callback-local const stays for intra-group references; only
    // membership in the stored return object is subject to lean analysis.
    const include = options?.includeInReturn?.(node.id) ?? true
    return { stmt, returnsVar: hasReturn && include ? varName : undefined }
  })

  const returned = members.map((m) => m.returnsVar).filter((v): v is string => v !== undefined)
  const body = members.map((m) => m.stmt).join('\n')
  const ret = returned.length > 0 ? `\n  return { ${returned.join(', ')} };` : ''
  const prefix = returned.length > 0 ? `const { ${returned.join(', ')} } = ` : ''
  return `${prefix}await flow.step("${stepLabel(nodes[0]!)}", ${generateStepConfig(DEFAULT_STEP_CONFIG)}, async (ctx) => {
${indent(body, 2)}${ret}
});`
}
