import type { WorkflowIR } from '@awaitstep/ir'
import { isExportedName } from '@awaitstep/codegen'

export interface OutputConsumption {
  /**
   * True when the node's output must be stored: its name carries the
   * EXPORT_ marker, or any node outside `exclude` (and other than itself)
   * references its variable name as a whole identifier in node data — code,
   * expressions, conditions, inputs. Identifier-token matching over node
   * data is the same contract module `inputs` filtering uses: dynamic
   * access the generator cannot see is out of scope by design, and false
   * positives only keep a value that lean emission would have dropped.
   */
  isConsumed(nodeId: string, exclude?: ReadonlySet<string>): boolean
}

const IDENTIFIER_RE = /[A-Za-z_$][A-Za-z0-9_$]*/g

export function buildOutputConsumption(
  ir: WorkflowIR,
  varNameFor: (nodeId: string) => string,
): OutputConsumption {
  // One identifier-token set per node, built once: isConsumed becomes a set
  // lookup per other node instead of a regex scan of its full data text.
  const nodeTokens = new Map(
    ir.nodes.map((n) => [n.id, new Set(JSON.stringify(n.data).match(IDENTIFIER_RE) ?? [])]),
  )
  const nameById = new Map(ir.nodes.map((n) => [n.id, n.name]))

  return {
    isConsumed(nodeId: string, exclude?: ReadonlySet<string>): boolean {
      const name = nameById.get(nodeId)
      if (name !== undefined && isExportedName(name)) return true
      const varName = varNameFor(nodeId)
      for (const [otherId, tokens] of nodeTokens) {
        if (otherId === nodeId || exclude?.has(otherId)) continue
        if (tokens.has(varName)) return true
      }
      return false
    },
  }
}
