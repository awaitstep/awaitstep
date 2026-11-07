import type { WorkflowIR } from '@awaitstep/ir'
import {
  blockBindingsOf,
  containerArms,
  normalizeStepModules,
  stepBodyFromModule,
} from '@awaitstep/codegen'

/**
 * A step's code for the other side of the Inline switch: turned on, the
 * module becomes the statements an inline step holds (the `inputs` reads
 * become the bare names the surrounding block binds); turned off, the
 * statements become the module, with what they read taken from `inputs`.
 * Code the conversion cannot read is returned as it is, and the step reports
 * the mismatch.
 */
export function stepCodeForInline(
  ir: Pick<WorkflowIR, 'nodes' | 'edges' | 'entryNodeId'> & { kind?: string },
  nodeId: string,
  inline: boolean,
): string {
  const node = ir.nodes.find((n) => n.id === nodeId)
  const code = String(node?.data.code ?? '')
  if (!node || node.type !== 'step') return code
  if (inline) return stepBodyFromModule(code, bindingsAround(ir, nodeId))
  const asModule = {
    ...ir,
    nodes: ir.nodes.map((n) =>
      n.id === nodeId ? { ...n, data: { ...n.data, inline: false } } : n,
    ),
  }
  return String(
    normalizeStepModules(asModule).nodes.find((n) => n.id === nodeId)?.data.code ?? code,
  )
}

function bindingsAround(
  ir: Pick<WorkflowIR, 'nodes' | 'edges' | 'entryNodeId'>,
  nodeId: string,
): Record<string, string> {
  try {
    return blockBindingsOf(ir, containerArms(ir as WorkflowIR))(nodeId)
  } catch {
    return {}
  }
}
