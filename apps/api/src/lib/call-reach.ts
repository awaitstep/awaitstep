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

/** Where a deploy goes: its connection's provider, and the connection. */
export interface CallDeployTarget {
  provider: string
  connectionId?: string
}

/** A Worker name AwaitStep deploys as: unknown, it is one deleted or not this instance's. */
const OURS = /^awaitstep-/i

/**
 * Whether a call naming nothing this instance knows is refused. Only where
 * the instance asks for it, and then not on an account the project alone
 * uses (its own, or an organization account no other project may use): a
 * deploy there may name a Worker deployed some other way. One other projects
 * deploy to too could hold theirs. With no deploy (a save, a test session, a
 * local run), it goes by whether the project has such an account.
 */
async function refusesUnknown(
  db: Pick<DatabaseAdapter, 'hasAccountOutsideProviders'>,
  workflowId: string,
  target: CallDeployTarget | undefined,
): Promise<boolean> {
  if (!strictCallTargets()) return false
  if (target && isInstanceOperated(target.provider)) return true
  return !(await db.hasAccountOutsideProviders(
    workflowId,
    instanceOperatedProviders(),
    target?.connectionId,
  ))
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
  target?: CallDeployTarget,
): Promise<UnreachableCall[]> {
  const calls = callTargets(ir)
  if (calls.length === 0) return []
  const { unreachable, unknown } = await db.listUnreachableCallTargets(
    workflowId,
    organizationId,
    calls.map((call) => call.target),
  )
  const refused = new Set(unreachable)
  if (strictCallTargets()) {
    // Never one named as ours: what that names is gone, or another instance's.
    for (const name of unknown) if (OURS.test(name)) refused.add(name)
  }
  const rest = unknown.filter((name) => !refused.has(name))
  if (rest.length > 0 && (await refusesUnknown(db, workflowId, target))) {
    for (const name of rest) refused.add(name)
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
