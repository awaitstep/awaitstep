import type { WorkflowNode, StepConfig, RetryBackoff } from '@awaitstep/ir'
import { varName, escName, type GenerateMode } from '@awaitstep/codegen'
import { generateStepConfig } from './config.js'

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

export function generateStep(node: WorkflowNode, mode: GenerateMode = 'workflow'): string {
  const code = String(node.data.code ?? '')
  if (mode === 'script') {
    // Step code is inlined raw into `runGraph`. `return X` exits runGraph
    // with X. To share values across steps, declare `const myVar = ...`.
    // To expose on graph, name the node `EXPORT_X` and declare `const X = ...`.
    return code
  }
  const hasReturn = /\breturn\b/.test(code)
  const prefix = hasReturn ? `const ${varName(node.id)} = ` : ''
  if (node.data.inline === true) {
    // Inline steps skip the durable `step.do` wrap — user code runs as a
    // bare async IIFE in the workflow body. Trades durability/retries for
    // raw-code ergonomics; appropriate for pure transforms or quick checks
    // that don't need to be cached/resumed.
    return `${prefix}await (async () => {
  ${code}
})();`
  }
  const config = generateStepConfig(resolveStepConfig(node))
  const configArg = config ? `, ${config}` : ''
  return `${prefix}await step.do("${escName(node.name)}"${configArg}, async () => {
  ${code}
});`
}
