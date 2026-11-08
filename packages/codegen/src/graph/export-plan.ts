import type { WorkflowIR, WorkflowNode } from '@awaitstep/ir'
import {
  AUTO_EXPORT_TYPES,
  computeVarNames,
  containerArms,
  isExportedNode,
  isValidExportKey,
  sanitizeIdentifier,
  stepReturnsValue,
  topologicalSort,
  type ArmBlock,
} from './internal.js'

/** Kinds that emit no value of their own, whatever their data says. */
const VALUELESS_TYPES = new Set(['branch', 'try_catch', 'sleep', 'sleep_until', 'break'])
/**
 * Whether the generated code binds a value to this node's variable: a step
 * only when its code has a `return`, a loop only when a step directly in its
 * body returns a value (the loop's value is the last one such a step
 * returned; a step nested deeper, in a branch inside the body, is scoped to
 * that block and cannot be captured), branches and the other flow-only kinds
 * never, every other kind always. An inline step binds nothing the generator
 * knows of. `arms` is `containerArms(ir)`, computed once by the caller when
 * it asks about several nodes.
 */
export function nodeYieldsValue(
  ir: Pick<WorkflowIR, 'nodes' | 'edges' | 'entryNodeId'>,
  node: WorkflowNode,
  arms: Map<string, ArmBlock> = containerArms(ir as WorkflowIR),
): boolean {
  if (node.data.inline === true || VALUELESS_TYPES.has(node.type)) return false
  if (node.type === 'step') return stepReturnsValue(String(node.data.code ?? ''))
  if (node.type === 'loop') {
    return ir.nodes.some(
      (candidate) =>
        candidate.type === 'step' &&
        arms.get(candidate.id)?.owner === node.id &&
        nodeYieldsValue(ir, candidate, arms),
    )
  }
  return true
}

/**
 * The var names a call site can bind: nodes whose variable holds a value, and
 * an inline step that declares its own variable in the surrounding scope.
 */
export function boundVarNames(
  ir: Pick<WorkflowIR, 'nodes' | 'edges' | 'entryNodeId'>,
  names: Map<string, string>,
): Map<string, string> {
  const arms = containerArms(ir as WorkflowIR)
  const bound = new Map<string, string>()
  for (const node of ir.nodes) {
    const name = names.get(node.id)
    if (!name) continue
    const declaresItself =
      node.type === 'step' &&
      node.data.inline === true &&
      new RegExp(`\\b(?:const|let|var)\\s+${name}\\b`).test(String(node.data.code ?? ''))
    if (declaresItself || nodeYieldsValue(ir, node, arms)) bound.set(node.id, name)
  }
  return bound
}

/** A node a function returns, and the key its value comes back under. */
export interface ExportPlanEntry {
  nodeId: string
  varName: string
  key: string
}

/**
 * Which nodes a function returns and under which keys — the rule the export
 * pass applies, computed from the graph alone so the canvas can show the
 * same answer. A node is returned when its variable holds a value
 * (`nodeYieldsValue`) and either its data says `export: true` (or the legacy
 * `EXPORT_` name) or its kind is always returned. Keys: a node's own variable
 * name first, so an `exportAs` on another node never takes it; explicit keys
 * then follow in run order, with `_2`, `_3` on a repeat.
 */
export function exportPlan(
  ir: Pick<WorkflowIR, 'nodes' | 'edges' | 'entryNodeId'>,
): Map<string, ExportPlanEntry> {
  const graph = ir as WorkflowIR
  const names = computeVarNames(ir.nodes)
  const sorted = topologicalSort(graph)
  const arms = containerArms(graph)
  const returned = sorted.filter(
    (node) =>
      nodeYieldsValue(ir, node, arms) && (isExportedNode(node) || AUTO_EXPORT_TYPES.has(node.type)),
  )
  const varNameOf = (node: WorkflowNode) => names.get(node.id) || sanitizeIdentifier(node.id)
  const explicitKey = (node: WorkflowNode): string | undefined => {
    const key = node.data.exportAs
    return typeof key === 'string' && isValidExportKey(key) ? key : undefined
  }
  const plan = new Map<string, ExportPlanEntry>()
  const used = new Set<string>()
  for (const node of returned) {
    if (explicitKey(node) !== undefined) continue
    const varName = varNameOf(node)
    used.add(varName)
    plan.set(node.id, { nodeId: node.id, varName, key: varName })
  }
  for (const node of returned) {
    const base = explicitKey(node)
    if (base === undefined) continue
    let key = base
    for (let n = 2; used.has(key); n++) key = `${base}_${n}`
    used.add(key)
    plan.set(node.id, { nodeId: node.id, varName: varNameOf(node), key })
  }
  return plan
}
