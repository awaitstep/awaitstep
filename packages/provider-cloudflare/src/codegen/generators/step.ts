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
  // Inline steps (and script mode) emit raw user code with no wrapping.
  // The user owns the surrounding scope: they can mutate enclosing `let`s,
  // declare local vars, and add their own IIFE if they want one. To share a
  // value with downstream nodes, declare `const X = ...` matching the
  // sanitized node id.
  if (mode === 'script' || node.data.inline === true) {
    return code
  }
  const hasReturn = /\breturn\b/.test(code)
  const prefix = hasReturn ? `const ${varName(node.id)} = ` : ''
  const config = generateStepConfig(resolveStepConfig(node))
  const configArg = config ? `, ${config}` : ''
  return `${prefix}await step.do("${escName(node.name)}"${configArg}, async () => {
  ${code}
});`
}
