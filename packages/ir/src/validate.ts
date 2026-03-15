import type { Result, ValidationError, WorkflowIR } from './types.js'
import { workflowIRSchema } from './schema.js'

export function validateIR(input: unknown): Result<WorkflowIR, ValidationError[]> {
  const result = workflowIRSchema.safeParse(input)

  if (!result.success) {
    const errors: ValidationError[] = result.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }))
    return { ok: false, errors }
  }

  const ir = result.data as WorkflowIR
  const structuralErrors = validateStructure(ir)

  if (structuralErrors.length > 0) {
    return { ok: false, errors: structuralErrors }
  }

  return { ok: true, value: ir }
}

function validateStructure(ir: WorkflowIR): ValidationError[] {
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
      })
    }
    seenIds.add(node.id)
  }

  for (const edge of ir.edges) {
    if (!nodeIds.has(edge.source)) {
      errors.push({
        path: `edges.${edge.id}.source`,
        message: `Edge source "${edge.source}" does not exist in nodes`,
      })
    }
    if (!nodeIds.has(edge.target)) {
      errors.push({
        path: `edges.${edge.id}.target`,
        message: `Edge target "${edge.target}" does not exist in nodes`,
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
    })
  }

  return errors
}

function detectCycle(ir: WorkflowIR): ValidationError | null {
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

function findUnreachableNodes(ir: WorkflowIR): string[] {
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
