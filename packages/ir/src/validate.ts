import type { ArtifactIR, Result, ScriptIR, ValidationError, WorkflowIR } from './types.js'
import { scriptIRSchema, workflowIRSchema } from './schema.js'

export function validateIR(input: unknown): Result<WorkflowIR, ValidationError[]> {
  const result = workflowIRSchema.safeParse(input)

  if (!result.success) {
    return { ok: false, errors: zodIssuesToErrors(input, result.error.issues) }
  }

  const ir = result.data as WorkflowIR
  const structuralErrors = validateStructure(ir)

  if (structuralErrors.length > 0) {
    return { ok: false, errors: structuralErrors }
  }

  return { ok: true, value: ir }
}

export function validateScript(input: unknown): Result<ScriptIR, ValidationError[]> {
  const result = scriptIRSchema.safeParse(input)

  if (!result.success) {
    return { ok: false, errors: zodIssuesToErrors(input, result.error.issues) }
  }

  const ir = result.data as ScriptIR
  const structuralErrors = [...validateStructure(ir), ...validateScriptCompatibility(ir)]

  if (structuralErrors.length > 0) {
    return { ok: false, errors: structuralErrors }
  }

  return { ok: true, value: ir }
}

/**
 * Dispatches to {@link validateIR} or {@link validateScript} based on the
 * `kind` discriminator. Treat absence of `kind` as `'workflow'` so legacy
 * stored IRs continue to validate.
 */
export function validateArtifact(input: unknown): Result<ArtifactIR, ValidationError[]> {
  const kind = (input as { kind?: string } | null)?.kind
  if (kind === 'script') {
    return validateScript(input)
  }
  return validateIR(input)
}

function zodIssuesToErrors(
  input: unknown,
  issues: { path: PropertyKey[]; message: string }[],
): ValidationError[] {
  const rawInput = input as { nodes?: { id?: string }[] }
  return issues.map((issue) => {
    const error: ValidationError = {
      path: issue.path.join('.'),
      message: issue.message,
    }
    if (issue.path[0] === 'nodes' && typeof issue.path[1] === 'number') {
      const nodeId = rawInput.nodes?.[issue.path[1]]?.id
      if (nodeId) error.nodeId = nodeId
    }
    return error
  })
}

export const SCRIPT_INCOMPATIBLE_NODE_TYPES = new Set(['wait_for_event', 'sleep', 'sleep_until'])

function validateScriptCompatibility(ir: ScriptIR): ValidationError[] {
  const errors: ValidationError[] = []
  for (const node of ir.nodes) {
    if (SCRIPT_INCOMPATIBLE_NODE_TYPES.has(node.type)) {
      errors.push({
        path: `nodes.${node.id}`,
        message: `Node type "${node.type}" requires a durable runtime and cannot be used in a script — use a workflow instead`,
        nodeId: node.id,
      })
    }
  }
  return errors
}

function validateStructure(ir: ArtifactIR): ValidationError[] {
  const errors: ValidationError[] = []
  const nodeIds = new Set(ir.nodes.map((n) => n.id))

  if (!nodeIds.has(ir.entryNodeId)) {
    errors.push({
      path: 'entryNodeId',
      message: `Entry node "${ir.entryNodeId}" does not exist in nodes`,
    })
  }

  const seenIds = new Set<string>()
  for (const node of ir.nodes) {
    if (seenIds.has(node.id)) {
      errors.push({
        path: `nodes`,
        message: `Duplicate node id "${node.id}"`,
        nodeId: node.id,
      })
    }
    seenIds.add(node.id)
  }

  for (const edge of ir.edges) {
    if (!nodeIds.has(edge.source)) {
      errors.push({
        path: `edges.${edge.id}.source`,
        message: `Edge source "${edge.source}" does not exist in nodes`,
        nodeId: edge.source,
      })
    }
    if (!nodeIds.has(edge.target)) {
      errors.push({
        path: `edges.${edge.id}.target`,
        message: `Edge target "${edge.target}" does not exist in nodes`,
        nodeId: edge.target,
      })
    }
  }

  const cycleError = detectCycle(ir)
  if (cycleError) {
    errors.push(cycleError)
  }

  const unreachable = findUnreachableNodes(ir)
  for (const nodeId of unreachable) {
    errors.push({
      path: `nodes`,
      message: `Node "${nodeId}" is not reachable from entry node`,
      nodeId,
    })
  }

  // Type-specific validation
  errors.push(...validateTryCatchNodes(ir))
  errors.push(...validateLoopAndBreakNodes(ir))
  errors.push(...validateSubWorkflowNodes(ir))

  return errors
}

// ── Try/Catch validation ──

function validateTryCatchNodes(ir: ArtifactIR): ValidationError[] {
  const errors: ValidationError[] = []
  const edgesBySource = groupEdgesBySource(ir)

  for (const node of ir.nodes) {
    if (node.type !== 'try_catch') continue
    const outEdges = edgesBySource.get(node.id) ?? []
    const labels = new Set(outEdges.map((e) => e.label).filter(Boolean))

    if (!labels.has('try')) {
      errors.push({
        path: `nodes.${node.id}`,
        message: `Try/Catch node "${node.name}" must have a "try" edge`,
        nodeId: node.id,
      })
    }
    if (!labels.has('catch')) {
      errors.push({
        path: `nodes.${node.id}`,
        message: `Try/Catch node "${node.name}" must have a "catch" edge`,
        nodeId: node.id,
      })
    }

    for (const edge of outEdges) {
      if (edge.label && !['try', 'catch', 'finally', 'then'].includes(edge.label)) {
        errors.push({
          path: `edges.${edge.id}`,
          message: `Try/Catch edge label must be "try", "catch", or "finally" — got "${edge.label}"`,
          nodeId: node.id,
        })
      }
    }
  }

  return errors
}

// ── Loop + Break validation ──

function validateLoopAndBreakNodes(ir: ArtifactIR): ValidationError[] {
  const errors: ValidationError[] = []
  const nodeMap = new Map(ir.nodes.map((n) => [n.id, n]))
  const edgesBySource = groupEdgesBySource(ir)

  for (const node of ir.nodes) {
    if (node.type !== 'loop') continue
    const outEdges = edgesBySource.get(node.id) ?? []
    const hasBody = outEdges.some((e) => e.label === 'body')

    if (!hasBody) {
      errors.push({
        path: `nodes.${node.id}`,
        message: `Loop node "${node.name}" must have a "body" edge`,
        nodeId: node.id,
      })
    }

    const loopType = node.data.loopType as string | undefined
    if (!loopType || !['forEach', 'while', 'times'].includes(loopType)) {
      errors.push({
        path: `nodes.${node.id}.data.loopType`,
        message: `Loop node "${node.name}" must have loopType of "forEach", "while", or "times"`,
        nodeId: node.id,
      })
    }

    if (loopType === 'forEach') {
      if (!node.data.collection) {
        errors.push({
          path: `nodes.${node.id}.data.collection`,
          message: `forEach loop "${node.name}" requires a collection expression`,
          nodeId: node.id,
        })
      }
    }

    if (loopType === 'times') {
      const count = node.data.count as number | undefined
      if (count === undefined || count < 1) {
        errors.push({
          path: `nodes.${node.id}.data.count`,
          message: `times loop "${node.name}" requires a count >= 1`,
          nodeId: node.id,
        })
      }
    }

    // v1: disallow nested loops
    const bodyNodes = collectContainedNodes(node.id, 'body', ir)
    for (const bodyNodeId of bodyNodes) {
      const bodyNode = nodeMap.get(bodyNodeId)
      if (bodyNode?.type === 'loop') {
        errors.push({
          path: `nodes.${bodyNodeId}`,
          message: `Nested loops are not supported — loop "${bodyNode.name}" is inside loop "${node.name}"`,
          nodeId: bodyNodeId,
        })
      }
    }
  }

  // Break/exit nodes are valid both inside and outside loops.
  // Inside loops: generates `break;`. Outside: generates `return;`.

  return errors
}

// ── Sub-workflow validation ──

function validateSubWorkflowNodes(ir: ArtifactIR): ValidationError[] {
  const errors: ValidationError[] = []

  for (const node of ir.nodes) {
    if (node.type !== 'sub_workflow') continue

    if (!node.data.workflowId || typeof node.data.workflowId !== 'string') {
      errors.push({
        path: `nodes.${node.id}.data.workflowId`,
        message: `Sub-workflow node "${node.name}" requires a script name (workflowId)`,
        nodeId: node.id,
      })
    }

    if (!node.data.workflowName || typeof node.data.workflowName !== 'string') {
      errors.push({
        path: `nodes.${node.id}.data.workflowName`,
        message: `Sub-workflow node "${node.name}" requires a workflowName`,
        nodeId: node.id,
      })
    }
  }

  return errors
}

// ── Containment map ──
// Maps each node to the container node it's inside (branch/parallel/try_catch/loop).
// Traverses container edges (labeled) to find transitive containment.

interface ContainerInfo {
  containerId: string
  type: string
}

export function buildContainmentMap(ir: ArtifactIR): Map<string, ContainerInfo> {
  const containment = new Map<string, ContainerInfo>()
  const nodeMap = new Map(ir.nodes.map((n) => [n.id, n]))
  const containerTypes = new Set(['branch', 'parallel', 'try_catch', 'loop'])

  for (const node of ir.nodes) {
    if (!containerTypes.has(node.type)) continue
    const contained = collectContainedNodes(node.id, undefined, ir)
    for (const childId of contained) {
      // Innermost container wins — check if already set by a more specific container
      if (!containment.has(childId)) {
        containment.set(childId, { containerId: node.id, type: node.type })
      }
    }
  }

  // Re-run in reverse topo order so innermost containers overwrite outer ones
  const sorted = topoSort(ir)
  sorted.reverse()
  for (const nodeId of sorted) {
    const node = nodeMap.get(nodeId)
    if (!node || !containerTypes.has(node.type)) continue
    const contained = collectContainedNodes(node.id, undefined, ir)
    for (const childId of contained) {
      containment.set(childId, { containerId: node.id, type: node.type })
    }
  }

  return containment
}

function collectContainedNodes(
  containerId: string,
  label: string | undefined,
  ir: ArtifactIR,
): Set<string> {
  const adj = new Map<string, string[]>()
  for (const node of ir.nodes) adj.set(node.id, [])
  for (const edge of ir.edges) adj.get(edge.source)?.push(edge.target)

  const labeledEdges = ir.edges.filter(
    (e) => e.source === containerId && (label === undefined || e.label === label),
  )
  const startIds = labeledEdges.map((e) => e.target)

  const inDegree = new Map<string, number>()
  for (const node of ir.nodes) inDegree.set(node.id, 0)
  for (const edge of ir.edges) inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1)

  const contained = new Set<string>()
  const queue = [...startIds]

  while (queue.length > 0) {
    const id = queue.shift()!
    if (contained.has(id) || id === containerId) continue
    contained.add(id)

    const successors = adj.get(id) ?? []
    for (const succ of successors) {
      // Stop at nodes with in-degree > 1 that aren't direct targets (join nodes)
      if ((inDegree.get(succ) ?? 0) > 1 && !startIds.includes(succ)) continue
      if (!contained.has(succ)) queue.push(succ)
    }
  }

  return contained
}

// ── Helpers ──

function groupEdgesBySource(ir: ArtifactIR): Map<string, typeof ir.edges> {
  const map = new Map<string, typeof ir.edges>()
  for (const edge of ir.edges) {
    const list = map.get(edge.source) ?? []
    list.push(edge)
    map.set(edge.source, list)
  }
  return map
}

function topoSort(ir: ArtifactIR): string[] {
  const adj = new Map<string, string[]>()
  for (const node of ir.nodes) adj.set(node.id, [])
  for (const edge of ir.edges) adj.get(edge.source)?.push(edge.target)

  const inDegree = new Map<string, number>()
  for (const node of ir.nodes) inDegree.set(node.id, 0)
  for (const edge of ir.edges) inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1)

  const queue: string[] = []
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id)
  }

  const sorted: string[] = []
  while (queue.length > 0) {
    const id = queue.shift()!
    sorted.push(id)
    for (const succ of adj.get(id) ?? []) {
      const deg = (inDegree.get(succ) ?? 1) - 1
      inDegree.set(succ, deg)
      if (deg === 0) queue.push(succ)
    }
  }

  return sorted
}

function detectCycle(ir: ArtifactIR): ValidationError | null {
  const adjacency = new Map<string, string[]>()
  for (const node of ir.nodes) {
    adjacency.set(node.id, [])
  }
  for (const edge of ir.edges) {
    adjacency.get(edge.source)?.push(edge.target)
  }

  const visited = new Set<string>()
  const inStack = new Set<string>()

  function dfs(nodeId: string): boolean {
    visited.add(nodeId)
    inStack.add(nodeId)

    for (const neighbor of adjacency.get(nodeId) ?? []) {
      if (!visited.has(neighbor)) {
        if (dfs(neighbor)) return true
      } else if (inStack.has(neighbor)) {
        return true
      }
    }

    inStack.delete(nodeId)
    return false
  }

  for (const node of ir.nodes) {
    if (!visited.has(node.id)) {
      if (dfs(node.id)) {
        return {
          path: 'edges',
          message: 'Workflow graph contains a cycle',
        }
      }
    }
  }

  return null
}

function findUnreachableNodes(ir: ArtifactIR): string[] {
  const adjacency = new Map<string, string[]>()
  for (const node of ir.nodes) {
    adjacency.set(node.id, [])
  }
  for (const edge of ir.edges) {
    adjacency.get(edge.source)?.push(edge.target)
  }

  const reachable = new Set<string>()
  const queue = [ir.entryNodeId]
  reachable.add(ir.entryNodeId)

  while (queue.length > 0) {
    const current = queue.shift()!
    for (const neighbor of adjacency.get(current) ?? []) {
      if (!reachable.has(neighbor)) {
        reachable.add(neighbor)
        queue.push(neighbor)
      }
    }
  }

  return ir.nodes.filter((n) => !reachable.has(n.id)).map((n) => n.id)
}
