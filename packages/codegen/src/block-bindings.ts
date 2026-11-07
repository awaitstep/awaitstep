import type { WorkflowIR, WorkflowNode } from '@awaitstep/ir'
import { blockChain, type ArmBlock } from './dag.js'

/** The counter a loop's generated code keeps, which a body step reads as `inputs.index`. */
export const LOOP_COUNTER_VAR = '_loop_i'
/** The name a generated catch block binds the thrown error to, read by a step as `inputs.error`. */
export const CATCH_ERROR_VAR = 'err'

/**
 * What a loop binds for the steps in its body, as `inputs` key → the
 * expression the call site passes: the item under its configured name for a
 * forEach, and the iteration index for every kind.
 */
export function loopBindings(node: Pick<WorkflowNode, 'data'>): Record<string, string> {
  const itemVar = String(node.data.itemVar ?? 'item')
  return node.data.loopType === 'forEach'
    ? { [itemVar]: itemVar, index: LOOP_COUNTER_VAR }
    : { index: LOOP_COUNTER_VAR }
}

/** What a catch arm binds for the steps in it. */
export const CATCH_BINDINGS: Readonly<Record<string, string>> = { error: CATCH_ERROR_VAR }

/**
 * Everything the containers around each node bind for it — a loop's item and
 * index, a catch arm's error — outermost first, so an inner binding wins.
 * `arms` is `containerArms(ir)`; the node index is built once for the graph.
 */
export function blockBindingsOf(
  ir: Pick<WorkflowIR, 'nodes' | 'edges'>,
  arms: Map<string, ArmBlock>,
): (nodeId: string) => Record<string, string> {
  const nodes = new Map(ir.nodes.map((node) => [node.id, node]))
  const labels = new Map(ir.edges.map((edge) => [`${edge.source}\0${edge.target}`, edge.label]))
  return (nodeId) => {
    const bindings: Record<string, string> = {}
    for (const block of blockChain(arms, nodeId).reverse()) {
      const owner = nodes.get(block.owner)
      if (!owner) continue
      if (owner.type === 'loop') Object.assign(bindings, loopBindings(owner))
      if (owner.type === 'try_catch' && labels.get(`${owner.id}\0${block.arm}`) === 'catch') {
        Object.assign(bindings, CATCH_BINDINGS)
      }
    }
    return bindings
  }
}
