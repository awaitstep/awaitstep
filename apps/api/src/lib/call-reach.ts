import { callTargets, unreachableCallMessage, type ArtifactIR } from '@awaitstep/ir'
import type { DatabaseAdapter } from '@awaitstep/db'
import {
  instanceOperatedProviders,
  isInstanceOperated,
  strictCallTargets,
} from './provider-registry.js'

/** A call node naming what its workflow may not call. */
export interface UnreachableCall {
  nodeId: string
  nodeName: string
  message: string
}

/**
 * Whether a call naming nothing this instance knows is refused. Only where
 * the instance asks for it, and then only for what it runs itself: a deploy
 * to an account the project connected may name a Worker deployed some other
 * way. With no provider named (a save, a test session, a local run), it goes
 * by whether the workflow's project has such an account.
 */
async function refusesUnknown(
  db: Pick<DatabaseAdapter, 'hasAccountOutsideProviders'>,
  workflowId: string,
  provider: string | undefined,
): Promise<boolean> {
  if (!strictCallTargets()) return false
  if (provider) return isInstanceOperated(provider)
  return !(await db.hasAccountOutsideProviders(workflowId, instanceOperatedProviders()))
}

/**
 * The call nodes of `ir` that name something out of the workflow's reach (its
 * own workspace, or shared to its project), and where calls are strict those
 * naming nothing the instance knows. Asked only when it calls something, in
 * one statement; a second only for an unknown name on a strict instance. A
 * save warns with these; a deploy, a test session and a local run refuse on
 * them.
 */
export async function unreachableCalls(
  db: Pick<DatabaseAdapter, 'listUnreachableCallTargets' | 'hasAccountOutsideProviders'>,
  workflowId: string,
  organizationId: string,
  ir: Pick<ArtifactIR, 'nodes'>,
  provider?: string,
): Promise<UnreachableCall[]> {
  const calls = callTargets(ir)
  if (calls.length === 0) return []
  const { unreachable, unknown } = await db.listUnreachableCallTargets(
    workflowId,
    organizationId,
    calls.map((call) => call.target),
  )
  const refused = new Set(unreachable)
  if (unknown.length > 0 && (await refusesUnknown(db, workflowId, provider))) {
    for (const name of unknown) refused.add(name)
  }
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
