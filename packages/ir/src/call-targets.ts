import type { ArtifactIR } from './types.js'

export interface CallTarget {
  /** The Call Workflow or Call Function node. */
  nodeId: string
  /** What it names: the target's AwaitStep id or its deployed name. */
  target: string
}

/** The fields a call node may name its target in, first one set wins (`workerName` is the older spelling). */
const TARGET_FIELDS: Readonly<Record<string, readonly string[]>> = {
  sub_workflow: ['workflowId'],
  sub_script: ['scriptId', 'workerName'],
}

/** Every workflow or function the artifact's call nodes name; a node naming nothing is left out. */
export function callTargets(ir: Pick<ArtifactIR, 'nodes'>): CallTarget[] {
  const targets: CallTarget[] = []
  for (const node of ir.nodes) {
    const fields = TARGET_FIELDS[node.type]
    if (!fields) continue
    const named = fields.map((field) => node.data[field]).find((value) => value != null)
    const target = String(named ?? '').trim()
    if (target) targets.push({ nodeId: node.id, target })
  }
  return targets
}

/** Said of a call the workflow may not make. */
export function unreachableCallMessage(target: string): string {
  return `This calls "${target}", which it cannot reach. A workflow or function can call what is in its own workspace, and what another workspace of its project has shared.`
}
