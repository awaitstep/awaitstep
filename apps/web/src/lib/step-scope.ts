import type { WorkflowIR } from '@awaitstep/ir'
import {
  GenerateInputError,
  blockBindingsOf,
  computeVarNames,
  containerArms,
  exportKeyFor,
  sanitizeIdentifier,
  upstreamVarNamesOf,
} from '@awaitstep/codegen'
import { exportPlan, nodeYieldsValue } from '@awaitstep/provider-cloudflare/codegen'

export interface StepScope {
  /** The node's variable name in generated code: how later steps and the response name it. */
  varName: string
  /** The earlier steps this body can read as `inputs.<name>`, in run order. */
  upstream: string[]
  /** What the containers around the step bind for it (`item`, `index`, `error`), as `inputs` keys. */
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
    // Only a variable that holds a value is worth naming: a branch or a
    // step without a `return` binds nothing a body could read.
    const byName = new Map(ir.nodes.map((n) => [names.get(n.id), n]))
    const upstream = upstreamVarNamesOf(graph, names, (n) => plan.has(n.id), nodeId).filter(
      (name) => {
        const source = byName.get(name)
        return source !== undefined && nodeYieldsValue(graph, source, arms)
      },
    )
    return {
      varName,
      upstream,
      bindings: Object.keys(blockBindingsOf(graph, arms)(nodeId)),
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
