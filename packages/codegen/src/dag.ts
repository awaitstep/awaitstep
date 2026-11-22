import { isArmEdgeOf, type WorkflowIR, type WorkflowNode } from '@awaitstep/ir'
import { GenerateInputError } from './errors.js'

/** The node kinds whose successors run inside a block of their own; only a `then` edge leaves it. */
export const CONTAINER_TYPES: ReadonlySet<string> = new Set([
  'branch',
  'parallel',
  'try_catch',
  'loop',
  'race',
])

/**
 * Nodes that emit an arm as a block and take over their own successors: the
 * containers above, and a wait, whose on-event and on-timeout chains the wait
 * generator inlines itself.
 */
function isArmContainer(type: string): boolean {
  return CONTAINER_TYPES.has(type) || type === 'wait_for_event'
}

export function buildAdjacencyList(ir: WorkflowIR): Map<string, string[]> {
  const adj = new Map<string, string[]>()
  for (const node of ir.nodes) {
    adj.set(node.id, [])
  }
  for (const edge of ir.edges) {
    adj.get(edge.source)?.push(edge.target)
  }
  return adj
}

export function topologicalSort(ir: WorkflowIR): WorkflowNode[] {
  // Find all nodes reachable from entryNodeId
  const reachable = findReachable(ir)
  const reachableNodes = ir.nodes.filter((n) => reachable.has(n.id))
  const reachableEdges = ir.edges.filter((e) => reachable.has(e.source) && reachable.has(e.target))

  const adj = new Map<string, string[]>()
  for (const node of reachableNodes) adj.set(node.id, [])
  for (const edge of reachableEdges) adj.get(edge.source)?.push(edge.target)

  const inDegree = new Map<string, number>()
  for (const node of reachableNodes) inDegree.set(node.id, 0)
  for (const edge of reachableEdges) {
    inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1)
  }

  const queue: string[] = [ir.entryNodeId]
  const sorted: string[] = []

  while (queue.length > 0) {
    const current = queue.shift()!
    sorted.push(current)
    for (const neighbor of adj.get(current) ?? []) {
      const newDegree = (inDegree.get(neighbor) ?? 1) - 1
      inDegree.set(neighbor, newDegree)
      if (newDegree === 0) queue.push(neighbor)
    }
  }

  if (sorted.length !== reachableNodes.length) {
    throw new GenerateInputError('Workflow graph contains a cycle')
  }

  const nodeMap = new Map(reachableNodes.map((n) => [n.id, n]))
  return sorted.map((id) => nodeMap.get(id)!).filter(Boolean)
}

function findReachable(ir: WorkflowIR): Set<string> {
  const adj = new Map<string, string[]>()
  for (const node of ir.nodes) adj.set(node.id, [])
  for (const edge of ir.edges) adj.get(edge.source)?.push(edge.target)

  const visited = new Set<string>()
  const queue = [ir.entryNodeId]
  visited.add(ir.entryNodeId)

  while (queue.length > 0) {
    const current = queue.shift()!
    for (const neighbor of adj.get(current) ?? []) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor)
        queue.push(neighbor)
      }
    }
  }

  return visited
}

export function getEdgeLabels(ir: WorkflowIR): Map<string, Map<string, string | undefined>> {
  const labels = new Map<string, Map<string, string | undefined>>()
  for (const node of ir.nodes) {
    labels.set(node.id, new Map())
  }
  for (const edge of ir.edges) {
    labels.get(edge.source)?.set(edge.target, edge.label)
  }
  return labels
}

/** How many edges point at each node, over the whole graph. */
export function computeInDegree(ir: WorkflowIR): Map<string, number> {
  const inDegree = new Map<string, number>()
  for (const edge of ir.edges) {
    inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1)
  }
  return inDegree
}

/**
 * The run of nodes a container inlines from one arm: from the arm's first
 * node along single successors with a single predecessor. It stops at a join
 * (two or more edges in), at a fan-out, and after a nested container unless
 * its `then` continuation is a plain single-entry node. What the chain leaves
 * out is emitted at the top level.
 */
export function collectChain(
  startId: string,
  adj: Map<string, string[]>,
  inDegree: Map<string, number>,
  nodeMap: Map<string, WorkflowNode>,
  edgeLabels: Map<string, Map<string, string | undefined>>,
): WorkflowNode[] {
  const chain: WorkflowNode[] = []
  let currentId: string | null = startId

  while (currentId) {
    const node = nodeMap.get(currentId)
    if (!node) break

    chain.push(node)

    if (isArmContainer(node.type)) {
      // Container's normal successors are emitted by the container's own
      // generator (branches/body/etc.); the only thing that flows past it in
      // the parent context is the `then` continuation. Follow it if present
      // and not a join point — otherwise stop.
      const labels = edgeLabels.get(currentId)
      let thenTarget: string | null = null
      if (labels) {
        for (const [target, label] of labels) {
          if (label === 'then') {
            thenTarget = target
            break
          }
        }
      }
      if (thenTarget && (inDegree.get(thenTarget) ?? 0) === 1) {
        currentId = thenTarget
        continue
      }
      break
    }

    const successors: string[] = adj.get(currentId) ?? []
    if (successors.length === 1 && (inDegree.get(successors[0]!) ?? 0) === 1) {
      currentId = successors[0]!
    } else {
      currentId = null
    }
  }

  return chain
}

/** One arm of a container: the block its chain runs in. Shared by every node of the chain. */
export interface ArmBlock {
  /** The container node. */
  owner: string
  /** The arm's first node. */
  arm: string
}

/**
 * The block each inlined node runs in, by the emitter's own rule: a loop or
 * try_catch inlines the chains behind its `body`/`try`/`catch`/`finally`
 * edges, every other container the chains behind all edges but `then`. A
 * node in no chain — a join, a fan-out, a `then` continuation — is emitted
 * at the top level and has no block.
 *
 * Only the graph reachable from the entry counts, as for the emitter; a
 * container never sits in its own arm, so the owner chain of any block ends.
 */
export function containerArms(ir: WorkflowIR): Map<string, ArmBlock> {
  const cached = ARMS_BY_GRAPH.get(ir)
  if (cached) return cached
  const reachable = findReachable(ir)
  const nodes = ir.nodes.filter((node) => reachable.has(node.id))
  const edges = ir.edges.filter((edge) => reachable.has(edge.source) && reachable.has(edge.target))
  const graph: WorkflowIR = { ...ir, nodes, edges }
  const adj = buildAdjacencyList(graph)
  const inDegree = computeInDegree(graph)
  const nodeMap = new Map(nodes.map((node) => [node.id, node]))
  const edgeLabels = getEdgeLabels(graph)
  const bySource = new Map<string, WorkflowIR['edges']>()
  for (const edge of edges) {
    const list = bySource.get(edge.source)
    if (list) list.push(edge)
    else bySource.set(edge.source, [edge])
  }
  const blocks = new Map<string, ArmBlock>()
  for (const node of nodes) {
    if (!isArmContainer(node.type)) continue
    const armEdges = (bySource.get(node.id) ?? []).filter((edge) =>
      isArmEdgeOf(node.type, edge.label),
    )
    for (const edge of armEdges) {
      const block: ArmBlock = { owner: node.id, arm: edge.target }
      for (const member of collectChain(edge.target, adj, inDegree, nodeMap, edgeLabels)) {
        if (member.id === node.id || blocks.has(member.id)) continue
        blocks.set(member.id, block)
      }
    }

    // A merge of a branch's arms (or a wait's paths) is emitted inside each
    // arm, so its value is scoped to the arms too: a node after the container
    // must not be handed it, since no such `const` exists out there.
    if (node.type !== 'branch' && node.type !== 'wait_for_event') continue
    const armTargets = armEdges.map((edge) => edge.target)
    if (armTargets.length < 2) continue
    const ends = armTargets.map((target) => {
      const chain = collectChain(target, adj, inDegree, nodeMap, edgeLabels)
      return chain[chain.length - 1]?.id ?? target
    })
    const shared = (adj.get(ends[0]!) ?? []).filter(
      (id) =>
        ends.every((end) => end !== id && (adj.get(end) ?? []).includes(id)) &&
        (inDegree.get(id) ?? 0) >= 2,
    )
    if (shared.length !== 1) continue
    const mergeBlock: ArmBlock = { owner: node.id, arm: armTargets[0]! }
    for (const member of collectChain(shared[0]!, adj, inDegree, nodeMap, edgeLabels)) {
      if (blocks.has(member.id)) continue
      blocks.set(member.id, mergeBlock)
    }
  }
  ARMS_BY_GRAPH.set(ir, blocks)
  return blocks
}

/**
 * The arms of each graph object, computed once: a generation asks for them
 * from every container and from the export plan. A document is never
 * mutated after it is read, so the object is the key.
 */
const ARMS_BY_GRAPH = new WeakMap<object, Map<string, ArmBlock>>()

/** The blocks around a node, innermost first — bounded, so a malformed graph cannot spin it. */
export function blockChain(blocks: Map<string, ArmBlock>, nodeId: string): ArmBlock[] {
  const chain: ArmBlock[] = []
  const seen = new Set<string>()
  for (
    let block = blocks.get(nodeId);
    block && !seen.has(block.owner);
    block = blocks.get(block.owner)
  ) {
    seen.add(block.owner)
    chain.push(block)
  }
  return chain
}

/**
 * The variable names each node's body may read, in run order — what the
 * generated code binds at its call site: every earlier node in the same
 * block or an enclosing one, plus a node inside another block when `hoisted`
 * says its value is declared at the top (a returned child of a container). A
 * plain child of another block is left out: its `const` is scoped to that
 * block, and so is a sibling arm's.
 *
 * Blocks come from `containerArms`, the emitter's own rule, so a join or a
 * fan-out — emitted at the top level however deep its container — reads as
 * top level here too. One walk over the graph: each block's opening scope is
 * computed once, and a node's list is that plus its earlier siblings (with
 * the hoisted names under each).
 *
 * `names` gives each node the names it binds: one variable name, or several
 * (an inline step binds every name it declares at its top level).
 */
export function upstreamVarNames(
  ir: WorkflowIR,
  names: NodeBindings,
  hoisted: (node: WorkflowNode) => boolean,
): Map<string, string[]> {
  const scopes = scopeIndex(ir, names, hoisted)
  return new Map(scopes.sorted.map((node) => [node.id, scopes.of(node.id)]))
}

/**
 * `upstreamVarNames` answered per node on demand: the index is built once
 * (the sort refuses a cycle here), each list only when asked for.
 */
export function upstreamScopeOf(
  ir: WorkflowIR,
  names: NodeBindings,
  hoisted: (node: WorkflowNode) => boolean,
): (nodeId: string) => string[] {
  const scopes = scopeIndex(ir, names, hoisted)
  return (nodeId) => scopes.of(nodeId)
}

/**
 * At most this many extra scope passes, one per arm into a merge, are made
 * for one question: past it, a merge is read through its first arm only.
 */
export const MAX_MERGE_SCOPE_PASSES = 256

/**
 * Which node's binding of a name is in scope at a node: the nearest one, in
 * the graph as it is and — for a node at or after a branch's or a wait's
 * merge — once per arm into that merge, since a merge chain is emitted
 * inside every arm it joins (the emitter's `armContext` reads it the same
 * way). Answers the `nodeIds` only; a merge with none of them after it is
 * not recomputed. Lists one binder id per reading that finds one.
 */
export function bindersAcrossMerges(
  ir: WorkflowIR,
  names: NodeBindings,
  hoisted: (node: WorkflowNode) => boolean,
  nodeIds: Iterable<string>,
): (nodeId: string, name: string) => string[] {
  const wanted = new Set(nodeIds)
  if (wanted.size === 0) return () => []
  const readings = new Map<string, Array<(name: string) => string | undefined>>()
  const main = scopeIndex(ir, names, hoisted)
  for (const id of wanted) readings.set(id, [(name) => main.binderOf(id, name)])

  const blocks = containerArms(ir)
  const incoming = new Map<string, string[]>()
  const outgoing = new Map<string, string[]>()
  for (const edge of ir.edges) {
    const sources = incoming.get(edge.target)
    if (sources) sources.push(edge.source)
    else incoming.set(edge.target, [edge.source])
    const targets = outgoing.get(edge.source)
    if (targets) targets.push(edge.target)
    else outgoing.set(edge.source, [edge.target])
  }
  let passes = 0
  for (const [join, sources] of incoming) {
    // A join at the top level (a plain fan-in) is emitted once; only a merge
    // inside a container's arms is emitted per arm.
    if (sources.length < 2 || !blocks.has(join)) continue
    const after = new Set<string>([join])
    const queue = [join]
    while (queue.length > 0) {
      for (const next of outgoing.get(queue.pop()!) ?? []) {
        if (after.has(next)) continue
        after.add(next)
        queue.push(next)
      }
    }
    const hits = [...wanted].filter((id) => after.has(id))
    if (hits.length === 0) continue
    for (const source of new Set(sources)) {
      if (passes >= MAX_MERGE_SCOPE_PASSES) break
      passes += 1
      const variant: WorkflowIR = {
        ...ir,
        edges: ir.edges.filter((edge) => edge.target !== join || edge.source === source),
      }
      const scope = scopeIndex(variant, names, hoisted)
      for (const id of hits) readings.get(id)!.push((name) => scope.binderOf(id, name))
    }
  }
  return (nodeId, name) => {
    const binders = new Set<string>()
    for (const read of readings.get(nodeId) ?? []) {
      const binder = read(name)
      if (binder !== undefined) binders.add(binder)
    }
    return [...binders]
  }
}

/** `upstreamVarNames` for one node, without building every other node's list. */
export function upstreamVarNamesOf(
  ir: WorkflowIR,
  names: NodeBindings,
  hoisted: (node: WorkflowNode) => boolean,
  nodeId: string,
): string[] {
  return scopeIndex(ir, names, hoisted).of(nodeId)
}

/** The names each node binds, by node id: one name or a list of them. */
export type NodeBindings = ReadonlyMap<string, string | readonly string[]>

function namesOf(names: NodeBindings, nodeId: string): readonly string[] {
  const bound = names.get(nodeId)
  if (bound === undefined || bound === '') return []
  return typeof bound === 'string' ? [bound] : bound
}

/** A name in a node's scope, and the node that binds it. */
interface ScopeBinding {
  name: string
  nodeId: string
}

interface Entry extends ScopeBinding {
  index: number
}

function scopeIndex(
  ir: WorkflowIR,
  names: NodeBindings,
  hoisted: (node: WorkflowNode) => boolean,
): {
  sorted: WorkflowNode[]
  of(nodeId: string): string[]
  binders(nodeId: string): ScopeBinding[]
  binderOf(nodeId: string, name: string): string | undefined
} {
  const sorted = topologicalSort(ir)
  const index = new Map(sorted.map((node, i) => [node.id, i]))
  const nodeById = new Map(sorted.map((node) => [node.id, node]))
  const blocks = containerArms(ir)
  const blockKey = (block: ArmBlock | undefined) => (block ? `${block.owner}\0${block.arm}` : '')

  // The members of each block in run order, and the hoisted names under each
  // container (a returned child anywhere below it is declared at the top and
  // assigned when the container runs).
  const members = new Map<string, WorkflowNode[]>()
  const hoistedUnder = new Map<string, Entry[]>()
  for (const node of sorted) {
    const key = blockKey(blocks.get(node.id))
    const siblings = members.get(key)
    if (siblings) siblings.push(node)
    else members.set(key, [node])
    const bound = namesOf(names, node.id)
    if (bound.length > 0 && hoisted(node)) {
      for (const block of blockChain(blocks, node.id)) {
        const entries = bound.map((name) => ({ index: index.get(node.id)!, name, nodeId: node.id }))
        const under = hoistedUnder.get(block.owner)
        if (under) under.push(...entries)
        else hoistedUnder.set(block.owner, entries)
      }
    }
  }

  // What the k-th member of a block sees: the block's opening scope, then the
  // members before it, each followed by the hoisted names under it.
  const opening = new Map<string, Entry[]>()
  const openingOf = (block: ArmBlock | undefined): Entry[] => {
    if (!block) return []
    const key = blockKey(block)
    const known = opening.get(key)
    if (known) return known
    const owner = block.owner
    const scope = [...scopeEntries(owner)]
    // A wait's arms run after the wait bound its result, so they can read it;
    // no other container's arms see the container's own value.
    if (nodeById.get(owner)?.type === 'wait_for_event') {
      for (const name of namesOf(names, owner)) {
        scope.push({ index: index.get(owner)!, name, nodeId: owner })
      }
    }
    opening.set(key, scope)
    return scope
  }
  const scopeEntries = (nodeId: string): Entry[] => {
    const block = blocks.get(nodeId)
    const entries = [...openingOf(block)]
    for (const sibling of members.get(blockKey(block)) ?? []) {
      if (sibling.id === nodeId) break
      for (const name of namesOf(names, sibling.id)) {
        entries.push({ index: index.get(sibling.id)!, name, nodeId: sibling.id })
      }
      entries.push(...(hoistedUnder.get(sibling.id) ?? []))
    }
    return entries
  }

  // A name bound twice (an inline step shadowing an outer binding) is read
  // from the nearest binding: the latest in run order.
  const binders = (nodeId: string): ScopeBinding[] => {
    if (!index.has(nodeId)) return []
    const latest = new Map<string, Entry>()
    for (const entry of scopeEntries(nodeId).sort((a, b) => a.index - b.index)) {
      latest.delete(entry.name)
      latest.set(entry.name, entry)
    }
    return [...latest.values()].map(({ name, nodeId: binder }) => ({ name, nodeId: binder }))
  }

  // The nearest binder of one name, by the same walk without building the
  // whole list: a check asks this for a few names at many nodes.
  const binderOf = (nodeId: string, name: string): string | undefined => {
    if (!index.has(nodeId)) return undefined
    let best: Entry | undefined
    const consider = (entry: Entry) => {
      if (entry.name === name && (!best || entry.index > best.index)) best = entry
    }
    const block = blocks.get(nodeId)
    for (const entry of openingOf(block)) consider(entry)
    for (const sibling of members.get(blockKey(block)) ?? []) {
      if (sibling.id === nodeId) break
      if (namesOf(names, sibling.id).includes(name)) {
        consider({ index: index.get(sibling.id)!, name, nodeId: sibling.id })
      }
      for (const entry of hoistedUnder.get(sibling.id) ?? []) consider(entry)
    }
    return best?.nodeId
  }

  return {
    sorted,
    of: (nodeId) => binders(nodeId).map((entry) => entry.name),
    binders,
    binderOf,
  }
}
