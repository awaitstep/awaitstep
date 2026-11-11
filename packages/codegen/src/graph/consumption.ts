import type { WorkflowIR } from '@awaitstep/ir'
import { isExportedName } from './internal.js'
import { moduleInputReads } from '../module-inputs.js'
import { boundVarNames } from './export-plan.js'
import { upstreamVarNames } from '../dag.js'

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
  upstream?: Map<string, string[]>,
): OutputConsumption {
  // One identifier-token set per node, built once: isConsumed becomes a set
  // lookup per other node instead of a regex scan of its full data text.
  const nodeTokens = new Map(
    ir.nodes.map((n) => [n.id, new Set(JSON.stringify(n.data).match(IDENTIFIER_RE) ?? [])]),
  )
  const nameById = new Map(ir.nodes.map((n) => [n.id, n.name]))
  // A module that reads `inputs` whole receives every name its call site can
  // bind, so every one of those is consumed even though its code never names
  // it. Without this a producer looks unused and its `const` is dropped, while
  // the call site still hands its name over.
  const scopes =
    upstream ??
    upstreamVarNames(
      ir,
      boundVarNames(
        ir,
        new Map(ir.nodes.map((node) => [node.id, varNameFor(node.id)])),
      ),
      () => false,
    )
  const wholeReaders: { id: string; names: string[] }[] = []
  for (const node of ir.nodes) {
    const code = node.data.code
    if (typeof code !== 'string' || !moduleInputReads(code).all) continue
    const names = scopes.get(node.id)
    if (names && names.length > 0) wholeReaders.push({ id: node.id, names })
  }

  return {
    isConsumed(nodeId: string, exclude?: ReadonlySet<string>): boolean {
      const name = nameById.get(nodeId)
      if (name !== undefined && isExportedName(name)) return true
      const varName = varNameFor(nodeId)
      for (const [otherId, tokens] of nodeTokens) {
        if (otherId === nodeId || exclude?.has(otherId)) continue
        if (tokens.has(varName)) return true
      }
      for (const reader of wholeReaders) {
        if (exclude?.has(reader.id)) continue
        if (reader.names.includes(varName)) return true
      }
      return false
    },
  }
}
