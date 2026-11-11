import type { WorkflowIR, WorkflowNode } from '@awaitstep/ir'
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

/** A wait's arms; every other container's are its edges but `then`. */
const WAIT_ARM_LABELS = new Set(['onEvent', 'onTimeout'])

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

const ARM_LABELS = new Set(['body', 'try', 'catch', 'finally'])

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
      node.type === 'loop' || node.type === 'try_catch'
        ? ARM_LABELS.has(edge.label ?? '')
        : node.type === 'wait_for_event'
          ? WAIT_ARM_LABELS.has(edge.label ?? '')
          : edge.label !== 'then',
    )
    for (const edge of armEdges) {
      const block: ArmBlock = { owner: node.id, arm: edge.target }
      for (const member of collectChain(edge.target, adj, inDegree, nodeMap, edgeLabels)) {
        if (member.id === node.id || blocks.has(member.id)) continue
        blocks.set(member.id, block)
      }
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
 */
export function upstreamVarNames(
  ir: WorkflowIR,
  names: Map<string, string>,
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
  names: Map<string, string>,
  hoisted: (node: WorkflowNode) => boolean,
): (nodeId: string) => string[] {
  const scopes = scopeIndex(ir, names, hoisted)
  return (nodeId) => scopes.of(nodeId)
}

/** `upstreamVarNames` for one node, without building every other node's list. */
export function upstreamVarNamesOf(
  ir: WorkflowIR,
  names: Map<string, string>,
  hoisted: (node: WorkflowNode) => boolean,
  nodeId: string,
): string[] {
  return scopeIndex(ir, names, hoisted).of(nodeId)
}

interface Entry {
  index: number
  name: string
}

function scopeIndex(
  ir: WorkflowIR,
  names: Map<string, string>,
  hoisted: (node: WorkflowNode) => boolean,
): { sorted: WorkflowNode[]; of(nodeId: string): string[] } {
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
    const name = names.get(node.id)
    if (name && hoisted(node)) {
      for (const block of blockChain(blocks, node.id)) {
        const entry = { index: index.get(node.id)!, name }
        const under = hoistedUnder.get(block.owner)
        if (under) under.push(entry)
        else hoistedUnder.set(block.owner, [entry])
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
      const name = names.get(owner)
      if (name) scope.push({ index: index.get(owner)!, name })
    }
    opening.set(key, scope)
    return scope
  }
  const scopeEntries = (nodeId: string): Entry[] => {
    const block = blocks.get(nodeId)
    const entries = [...openingOf(block)]
    for (const sibling of members.get(blockKey(block)) ?? []) {
      if (sibling.id === nodeId) break
      const name = names.get(sibling.id)
      if (name) entries.push({ index: index.get(sibling.id)!, name })
      entries.push(...(hoistedUnder.get(sibling.id) ?? []))
    }
    return entries
  }

  return {
    sorted,
    of(nodeId) {
      if (!index.has(nodeId)) return []
      return scopeEntries(nodeId)
        .sort((a, b) => a.index - b.index)
        .map((entry) => entry.name)
    },
  }
}
