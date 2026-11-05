import { isBuiltinNodeType, type StepConfig, type WorkflowNode } from '@awaitstep/ir'
import { resolveStepConfig } from './step.js'

type SettingsNode = Pick<WorkflowNode, 'type' | 'data' | 'config'>

/** Builtin kinds whose generated code takes no retry policy or step timeout. */
const WITHOUT_STEP_CONFIG = new Set([
  'sleep',
  'sleep_until',
  'branch',
  'parallel',
  'race',
  'try_catch',
  'loop',
  'break',
  'sub_workflow',
])

export interface AppliedStepSettings {
  /** The generated code can carry a retry policy for this node. */
  retries: boolean
  /** The generated code can carry a timeout for this node. */
  timeout: boolean
  /** What the generated code actually carries; undefined means the runtime defaults. */
  config: StepConfig | undefined
}

/**
 * The retry policy and timeout the Cloudflare generators really emit for a
 * node, so what a person is told about a step matches the deployed code.
 *
 * It mirrors the generators: `step` also reads the loose fields on `data`
 * (see `resolveStepConfig`); `http_request`, `sub_script` and every registry
 * node read only `node.config`; `wait_for_event` reads `data.timeout`; and
 * the rest take nothing (a `sub_workflow` ignores its timeout, an inline
 * step is not a step at all).
 */
export function appliedStepSettings(node: SettingsNode): AppliedStepSettings {
  const none = { retries: false, timeout: false, config: undefined }
  if (node.type === 'step') {
    if (node.data.inline === true) return none
    return { retries: true, timeout: true, config: resolveStepConfig(node as WorkflowNode) }
  }
  if (node.type === 'wait_for_event') {
    const timeout = node.data.timeout
    return {
      retries: false,
      timeout: true,
      config: timeout ? { timeout: timeout as string | number } : undefined,
    }
  }
  if (WITHOUT_STEP_CONFIG.has(node.type)) return none
  // http_request, sub_script, and registry nodes (any type that is not builtin).
  if (node.type === 'http_request' || node.type === 'sub_script' || !isBuiltinNodeType(node.type)) {
    return { retries: true, timeout: true, config: node.config }
  }
  return none
}
