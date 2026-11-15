import { CONTINUE_LABEL, armMergeTargets, isArmEdgeOf, labelledArmsOf } from '@awaitstep/ir'

export interface OrderNode {
  id: string
  type: string
  /** Used only to break ties between roots: top to bottom, then left to right. */
  position?: { x: number; y: number }
  /** A wait's arm fields, which win over its edges as codegen reads them. */
  data?: Record<string, unknown>
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
  /**
   * This arm's path ends by running more: the nodes from where a branch's or
   * wait's arms meet on, which the generated code runs inside each arm, in
   * order. Their own rows are under the arm that leads straight to them; a
   * view shows them again here, as the code runs them twice.
   */
  thenRuns?: string[]
}

/**
 * Types whose outgoing edges are arms rather than "what comes next". The one
 * exception is the edge labelled `then`: the canvas draws it for what runs
 * after the block, and the generated code treats it the same way (it is left
 * out of the arms and followed after them).
 */
const FAN_OUT = new Set(['branch', 'parallel', 'race'])
/** Nesting past this is not walked, so a pathological graph cannot overflow the stack. */
const MAX_DEPTH = 100

/**
 * Whether an edge leaves its node as one of its arms: the IR's rule for a
 * branching node (a fan-out's non-`then` edges, a loop's `body`, a
 * try/catch's `try`/`catch`/`finally`, a wait's `onEvent`/`onTimeout`), and
 * every non-`then` edge of a plain node with more than one outgoing edge
 * (which is drawn as a fan-out).
 */
export function edgeIsArm(
  node: { type: string },
  edge: { label?: string },
  outgoingCount: number,
): boolean {
  if (edge.label === CONTINUE_LABEL) return false
  if (FAN_OUT.has(node.type) || labelledArmsOf(node.type) !== undefined) {
    return isArmEdgeOf(node.type, edge.label)
  }
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
  // Read once: where each branch's and wait's arms meet, if one leads straight there.
  const merges = armMergeTargets(nodes, edges)

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
    /** The first node is entered though other paths reach it too (an arm into the merge). */
    enterJoin = false,
  ): string | null {
    if (depth > MAX_DEPTH) return null
    let id: string | null = startId
    let entryArm = arm
    let isArmStart = firstIsArm
    // The row above this one on the same lane connects into it (a chain, or
    // the rejoin a container continues to after its arms).
    let fromAbove = false
    // A rejoin point was chosen by its container, so it is not stopped at again.
    let rejoined = enterJoin
    while (id !== null) {
      if (visited.has(id)) return null
      if (stopAtUnready && !rejoined && isJoin(id)) return id
      rejoined = false
      visited.add(id)
      const node: OrderNode = byId.get(id)!
      const outs: OrderEdge[] = outgoing.get(id) ?? []
      const labelled = labelledArmsOf(node.type)
      // A wait has no way on but its arms: where they meet is where it continues.
      const isFanOut: boolean =
        FAN_OUT.has(node.type) || node.type === 'wait_for_event' || (!labelled && outs.length > 1)
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
      // A branch or wait whose arm leads straight into where the others end:
      // the generated code runs that node inside each arm, so it shows as that
      // arm, not after the block. That arm is walked last (the others stop at
      // the merge first), then the arms are put back in their own order.
      const merge = merges.get(node.id) ?? null
      const ordered = merge
        ? [
            ...arms.filter((edge) => edge.target !== merge),
            ...arms.filter((edge) => edge.target === merge),
          ]
        : arms
      // The last row of each arm that ends at the merge, and the merge's own run.
      const endsAtMerge: StepRow[] = []
      let mergeRun: string[] = []
      const armRows = new Map<OrderEdge, StepRow[]>()
      for (const edge of ordered) {
        const intoMerge = edge.target === merge
        const armStart = rows.length
        const stoppedAt = walk(
          edge.target,
          depth + 1,
          id,
          edge.label ?? null,
          true,
          true,
          intoMerge,
        )
        if (stoppedAt !== null && !rejoin.includes(stoppedAt)) rejoin.push(stoppedAt)
        // An arm that ends at the merge runs it next, as the generated code does.
        if (merge !== null && !intoMerge && stoppedAt === merge) {
          for (let at = rows.length - 1; at >= armStart; at--) {
            if (rows[at]!.depth === depth + 1) {
              endsAtMerge.push(rows[at]!)
              break
            }
          }
        }
        if (intoMerge) {
          mergeRun = rows
            .slice(armStart)
            .filter((row) => row.depth === depth + 1)
            .map((row) => row.nodeId)
        }
        armRows.set(edge, rows.slice(armStart))
      }
      if (mergeRun.length > 0) for (const end of endsAtMerge) end.thenRuns = mergeRun
      if (ordered !== arms) {
        rows.length = firstArmRow
        for (const edge of arms) rows.push(...(armRows.get(edge) ?? []))
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
