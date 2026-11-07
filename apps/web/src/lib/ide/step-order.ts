export interface OrderNode {
  id: string
  type: string
  /** Used only to break ties between roots: top to bottom, then left to right. */
  position?: { x: number; y: number }
}

export interface OrderEdge {
  source: string
  target: string
  label?: string
}

export interface StepRow {
  nodeId: string
  /** 0 at the top level; one deeper inside each container arm. */
  depth: number
  /** The container this step sits inside, or null. */
  parentId: string | null
  /** The label of the edge that leads into an arm (`body`, `catch`, a branch name). */
  arm: string | null
  /** The first row of an arm, labelled or not: a tick joins its dot to the parent's lane. */
  armStart: boolean
  /** The lane above continues into this row (a chain step, or a rejoin after arms). */
  continuesAbove: boolean
  /** The step opens arms of its own, which can be folded away. */
  container: boolean
}

/**
 * Types whose outgoing edges are arms rather than "what comes next". The one
 * exception is the edge labelled `then`: the canvas draws it for what runs
 * after the block, and the generated code treats it the same way (it is left
 * out of the arms and followed after them).
 */
const FAN_OUT = new Set(['branch', 'parallel', 'race'])
const CONTINUE_LABEL = 'then'
/** Nesting past this is not walked, so a pathological graph cannot overflow the stack. */
const MAX_DEPTH = 100
/** Containers with named arms plus a plain way on. */
const ARM_LABELS: Readonly<Record<string, ReadonlySet<string>>> = {
  loop: new Set(['body']),
  try_catch: new Set(['try', 'catch', 'finally']),
}

/**
 * Whether an edge leaves its node as one of its arms. Mirrors the arm rule in
 * `orderSteps`: a fan-out's non-`then` edges, a loop's `body`, a try/catch's
 * `try`/`catch`/`finally`, and every non-`then` edge of a plain node with more
 * than one outgoing edge (which is drawn as a fan-out).
 */
export function edgeIsArm(
  node: { type: string },
  edge: { label?: string },
  outgoingCount: number,
): boolean {
  if (edge.label === CONTINUE_LABEL) return false
  if (FAN_OUT.has(node.type)) return true
  const labelled = Object.hasOwn(ARM_LABELS, node.type) ? ARM_LABELS[node.type] : undefined
  if (labelled !== undefined) return labelled.has(edge.label ?? '')
  return outgoingCount > 1
}

/**
 * The nodes in the order the canvas reads: from the trigger, following the
 * edges, with each container's arms nested under it.
 *
 * Containers are not stored as parents in the graph — they are nodes whose
 * outgoing edges are labelled — so nesting is worked out from the edges. An
 * arm runs until it reaches a node that other, unfinished arms still feed;
 * that node is where the arms rejoin, and it continues at the container's
 * own level. Nodes the walk never reaches (not connected to anything) are
 * listed last rather than hidden.
 */
export function orderSteps(nodes: readonly OrderNode[], edges: readonly OrderEdge[]): StepRow[] {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const outgoing = new Map<string, OrderEdge[]>()
  const incoming = new Map<string, string[]>()
  for (const edge of edges) {
    if (!byId.has(edge.source) || !byId.has(edge.target)) continue
    const from = outgoing.get(edge.source)
    if (from) from.push(edge)
    else outgoing.set(edge.source, [edge])
    const fromTargets = incoming.get(edge.target)
    if (fromTargets) fromTargets.push(edge.source)
    else incoming.set(edge.target, [edge.source])
  }

  const rows: StepRow[] = []
  const visited = new Set<string>()

  const ready = (id: string): boolean => (incoming.get(id) ?? []).every((from) => visited.has(from))
  const isJoin = (id: string): boolean => (incoming.get(id) ?? []).length > 1

  /**
   * Walks one chain. Returns the join it stopped at, so the container above
   * can decide where it continues.
   */
  function walk(
    startId: string,
    depth: number,
    parentId: string | null,
    arm: string | null,
    stopAtUnready: boolean,
    /** The first row is an arm, even when its edge has no label to show. */
    firstIsArm = false,
  ): string | null {
    if (depth > MAX_DEPTH) return null
    let id: string | null = startId
    let entryArm = arm
    let isArmStart = firstIsArm
    // The row above this one on the same lane connects into it (a chain, or
    // the rejoin a container continues to after its arms).
    let fromAbove = false
    // A rejoin point was chosen by its container, so it is not stopped at again.
    let rejoined = false
    while (id !== null) {
      if (visited.has(id)) return null
      if (stopAtUnready && !rejoined && isJoin(id)) return id
      rejoined = false
      visited.add(id)
      const node: OrderNode = byId.get(id)!
      const outs: OrderEdge[] = outgoing.get(id) ?? []
      const labelled = Object.hasOwn(ARM_LABELS, node.type) ? ARM_LABELS[node.type] : undefined
      const isFanOut: boolean = FAN_OUT.has(node.type) || (!labelled && outs.length > 1)
      const arms = outs.filter((edge) => edgeIsArm(node, edge, outs.length))
      const onward: OrderEdge[] = outs.filter((e) => !arms.includes(e))

      const row: StepRow = {
        nodeId: id,
        depth,
        parentId,
        arm: entryArm,
        armStart: isArmStart,
        continuesAbove: fromAbove,
        container: arms.length > 0,
      }
      rows.push(row)
      entryArm = null
      isArmStart = false
      fromAbove = false

      const rejoin: string[] = []
      const firstArmRow = rows.length
      for (const edge of arms) {
        const stoppedAt = walk(edge.target, depth + 1, id, edge.label ?? null, true, true)
        if (stoppedAt !== null && !rejoin.includes(stoppedAt)) rejoin.push(stoppedAt)
      }

      if (isFanOut) {
        // Where the block ends: what it was told runs after it, or the node its
        // arms meet at. Either belongs here only when nothing outside this
        // block feeds it; otherwise an outer block is the one that rejoins.
        const inside = new Set(rows.slice(firstArmRow).map((r) => r.nodeId))
        inside.add(id)
        const owned = (candidate: string) =>
          (incoming.get(candidate) ?? []).every((from) => inside.has(from))
        const candidates = [...onward.map((e) => e.target), ...rejoin]
        const next = candidates.find(
          (c) => !visited.has(c) && ready(c) && (!stopAtUnready || owned(c)),
        )
        if (next === undefined) return candidates.find((c) => !visited.has(c)) ?? null
        id = next
        rejoined = true
        fromAbove = true
        continue
      }
      // A plain node, or a container's way on: the first edge continues the
      // chain, and any more are treated as arms of their own.
      const first: OrderEdge | undefined = onward[0]
      const rest = onward.slice(1)
      for (const edge of rest) walk(edge.target, depth + 1, id, edge.label ?? null, true, true)
      id = first ? first.target : null
      if (first) fromAbove = true
      if (rest.length > 0) row.container = true
    }
    return null
  }

  const roots = nodes
    .filter((node) => (incoming.get(node.id) ?? []).length === 0)
    .sort(
      (a, b) =>
        (a.position?.y ?? 0) - (b.position?.y ?? 0) || (a.position?.x ?? 0) - (b.position?.x ?? 0),
    )
  for (const root of roots) walk(root.id, 0, null, null, false)

  // Anything left is not reachable from a trigger (a cycle, or a stray node).
  for (const node of nodes) {
    if (!visited.has(node.id)) walk(node.id, 0, null, null, false)
  }
  return rows
}

/** Rows still shown once the containers in `collapsed` are folded. */
export function visibleRows(rows: readonly StepRow[], collapsed: ReadonlySet<string>): StepRow[] {
  if (collapsed.size === 0) return [...rows]
  const hidden = new Set<string>()
  const shown: StepRow[] = []
  for (const row of rows) {
    const parentHidden =
      row.parentId !== null && (collapsed.has(row.parentId) || hidden.has(row.parentId))
    if (parentHidden) {
      hidden.add(row.nodeId)
      continue
    }
    shown.push(row)
  }
  return shown
}
