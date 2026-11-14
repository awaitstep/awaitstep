import type { ArtifactIR, ValidationError } from './types.js'

/** Nodes whose arms run as blocks of their own: the containers and a wait. */
const ARM_CONTAINER_TYPES: ReadonlySet<string> = new Set([
  'branch',
  'parallel',
  'try_catch',
  'loop',
  'race',
  'wait_for_event',
])

const LABELLED_ARMS: Readonly<Record<string, ReadonlySet<string>>> = {
  loop: new Set(['body']),
  try_catch: new Set(['try', 'catch', 'finally']),
  wait_for_event: new Set(['onEvent', 'onTimeout']),
}

/**
 * Whether an edge leaving a node of `type` with `label` starts one of its
 * arms: a loop's body, a try/catch's try/catch/finally, a wait's
 * onEvent/onTimeout, and any non-`then` edge of a branch, parallel or race.
 * A `then` edge is the container's way on, not an arm.
 */
export function isArmEdgeOf(type: string, label: string | undefined): boolean {
  if (!ARM_CONTAINER_TYPES.has(type)) return false
  const labelled = LABELLED_ARMS[type]
  if (labelled) return labelled.has(label ?? '')
  return label !== 'then'
}

/** At most this many arm errors are listed; the rest are counted in one more. */
const SHOWN_ARM_ERRORS = 50
/** A label longer than this is cut in the message: labels have no length limit. */
const SHOWN_LABEL_LENGTH = 40

/**
 * An arm whose first node is also reached another way. Generated code runs
 * an arm's first node inside that arm, so the node would run on that arm
 * only and the other paths into it would skip it.
 *
 * One error per container and node, however many of its edges lead there,
 * and at most {@link SHOWN_ARM_ERRORS} of them, so a refusal never answers
 * with more than the request sent.
 */
export function validateArmsIntoJoins(ir: Pick<ArtifactIR, 'nodes' | 'edges'>): ValidationError[] {
  const byId = new Map(ir.nodes.map((node) => [node.id, node]))
  const inDegree = new Map<string, number>()
  for (const edge of ir.edges) {
    if (edge.source === edge.target) continue
    inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1)
  }
  const errors: ValidationError[] = []
  const reported = new Set<string>()
  let unlisted = 0
  for (const edge of ir.edges) {
    const container = byId.get(edge.source)
    const target = byId.get(edge.target)
    if (!container || !target || edge.source === edge.target) continue
    if (!isArmEdgeOf(container.type, edge.label)) continue
    if ((inDegree.get(edge.target) ?? 0) < 2) continue
    const pair = JSON.stringify([container.id, target.id])
    if (reported.has(pair)) continue
    reported.add(pair)
    if (errors.length >= SHOWN_ARM_ERRORS) {
      unlisted++
      continue
    }
    errors.push({
      path: `edges.${edge.id}`,
      message: `${container.name}’s ${armName(edge.label)} leads straight into ${target.name}, which another path also reaches. Add a step to that arm first.`,
      nodeId: container.id,
    })
  }
  if (unlisted > 0) {
    errors.push({
      path: 'edges',
      message: `${unlisted} more arms lead straight into a step another path also reaches.`,
    })
  }
  return errors
}

function armName(label: string | undefined): string {
  if (!label) return 'arm'
  const shown = label.length > SHOWN_LABEL_LENGTH ? `${label.slice(0, SHOWN_LABEL_LENGTH)}…` : label
  return `“${shown}” arm`
}
