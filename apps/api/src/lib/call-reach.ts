import { callTargets, unreachableCallMessage, type ArtifactIR } from '@awaitstep/ir'
import type { DatabaseAdapter } from '@awaitstep/db'
import { strictCallTargets } from './provider-registry.js'

/** A call node naming what its workflow may not call. */
export interface UnreachableCall {
  nodeId: string
  nodeName: string
  message: string
}

/**
 * The call nodes of `ir` that name something out of the workflow's reach (its
 * own workspace, or shared to its project), and on an instance with strict
 * call targets those naming nothing it knows. Asked only when it calls
 * something, in one statement. A save warns with these; a deploy, a test
 * session and a local run refuse on them.
 */
export async function unreachableCalls(
  db: Pick<DatabaseAdapter, 'listUnreachableCallTargets'>,
  workflowId: string,
  organizationId: string,
  ir: Pick<ArtifactIR, 'nodes'>,
): Promise<UnreachableCall[]> {
  const calls = callTargets(ir)
  if (calls.length === 0) return []
  const refused = new Set(
    await db.listUnreachableCallTargets(
      workflowId,
      organizationId,
      calls.map((call) => call.target),
      strictCallTargets(),
    ),
  )
  if (refused.size === 0) return []
  const names = new Map(ir.nodes.map((node) => [node.id, node.name]))
  return calls
    .filter((call) => refused.has(call.target))
    .map((call) => ({
      nodeId: call.nodeId,
      nodeName: names.get(call.nodeId) ?? '',
      message: unreachableCallMessage(call.target),
    }))
}
