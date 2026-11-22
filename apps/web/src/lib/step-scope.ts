import type { WorkflowIR } from '@awaitstep/ir'
import {
  GenerateInputError,
  LOOP_COUNTER_VAR,
  blockBindingsOf,
  computeVarNames,
  containerArms,
  exportKeyFor,
  sanitizeIdentifier,
  upstreamVarNamesOf,
} from '@awaitstep/codegen'
import { boundVarNames, exportPlan } from '@awaitstep/codegen'

export interface StepScope {
  /** The node's variable name in generated code: how later steps and the response name it. */
  varName: string
  /**
   * The names this body can read from earlier steps, in run order: as
   * `inputs.<name>` in a step module, bare in an inline step. An earlier
   * inline step contributes every name it declares at its top level.
   */
  upstream: string[]
  /**
   * What the containers around the step bind for it: the `inputs` keys
   * (`item`, `index`, `error`) for a step module, the names in scope for an
   * inline step.
   */
  bindings: string[]
  /** `cycle`: the graph loops back, so nothing about scope can be said; `error`: the scope could not be read. */
  status: 'ok' | 'cycle' | 'error'
  /** True when a function returns this node's value (the switch is on and the body returns something). */
  returned: boolean
  /** The response key the value comes back under — or would, were it returned. */
  exportKey: string
}

/**
 * What a step body has in scope, read from the graph the way codegen does:
 * the same block model for what is bound, and the same export plan for what
 * a function returns. Never throws: a cycle reads as `status: 'cycle'`, any
 * other failure as `status: 'error'`, and the panel still renders.
 */
export function stepScope(
  ir: Pick<WorkflowIR, 'nodes' | 'edges' | 'entryNodeId'>,
  nodeId: string,
  kind: 'workflow' | 'script',
): StepScope {
  const graph = ir as WorkflowIR
  const names = computeVarNames(ir.nodes)
  const node = ir.nodes.find((n) => n.id === nodeId)
  const varName = names.get(nodeId) || sanitizeIdentifier(nodeId)
  const fallback = node ? exportKeyFor(node, varName) : varName
  const failed = (status: 'cycle' | 'error'): StepScope => ({
    varName,
    upstream: [],
    bindings: [],
    status,
    returned: false,
    exportKey: fallback,
  })
  try {
    const plan = kind === 'script' ? exportPlan(graph) : new Map()
    const planned = plan.get(nodeId)
    const arms = containerArms(graph)
    // Only what codegen binds is worth naming: a branch or a step without a
    // `return` binds nothing a body could read.
    const upstream = upstreamVarNamesOf(
      graph,
      boundVarNames(graph, names),
      (n) => plan.has(n.id),
      nodeId,
    )
    const bindings = blockBindingsOf(graph, arms)(nodeId)
    const inline = node?.type === 'step' && node.data.inline === true
    return {
      varName,
      upstream,
      // Inline code reads the lexical names; the loop counter is only
      // declared when something needs it, so it is not promised there.
      bindings: inline
        ? Object.values(bindings).filter((name) => name !== LOOP_COUNTER_VAR)
        : Object.keys(bindings),
      status: 'ok',
      returned: planned !== undefined,
      exportKey: planned?.key ?? fallback,
    }
  } catch (error) {
    // topologicalSort refuses a cycle with a GenerateInputError; anything
    // else is a defect, reported as such rather than as a cycle.
    return failed(error instanceof GenerateInputError ? 'cycle' : 'error')
  }
}
