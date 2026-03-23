import type { Edge } from '@xyflow/react'
import type { NodeType } from '@awaitstep/ir'
import type { FlowNode } from '../stores/workflow-store'

export type SimulationStepStatus = 'executed' | 'skipped-instant' | 'event-received'

export interface SimulationStep {
  nodeId: string
  nodeName: string
  nodeType: NodeType
  status: SimulationStepStatus
  detail: string
  index: number
}

export interface SimulationPath {
  id: string
  label: string
  steps: SimulationStep[]
  completed: boolean
}

export interface SimulationIssue {
  nodeId: string
  nodeName: string
  message: string
}

export interface SimulationResult {
  paths: SimulationPath[]
  issues: SimulationIssue[]
  nodesVisited: number
  unreachedNodeIds: string[]
  status: 'success' | 'has-issues'
}

const MAX_PATHS = 100

function getStepDetail(node: FlowNode): { status: SimulationStepStatus; detail: string } {
  const ir = node.data.irNode
  switch (ir.type) {
    case 'step':
      return { status: 'executed', detail: `Execute step: ${ir.name}` }
    case 'sleep':
      return { status: 'skipped-instant', detail: `Sleep ${ir.data.duration} (simulated instant)` }
    case 'sleep_until':
      return { status: 'skipped-instant', detail: `Sleep until ${ir.data.timestamp} (simulated instant)` }
    case 'branch':
      return { status: 'executed', detail: `Evaluate branch: ${ir.name}` }
    case 'parallel':
      return { status: 'executed', detail: `Fan out: ${ir.name}` }
    case 'http_request':
      return { status: 'executed', detail: `HTTP ${ir.data.method} ${ir.data.url} (simulated)` }
    case 'wait_for_event':
      return { status: 'event-received', detail: `Wait for event '${ir.data.eventType}' (simulated as received)` }
    default:
      return { status: 'executed', detail: `Execute: ${ir.name} (${ir.type})` }
  }
}

function findSimulationEntry(nodes: FlowNode[], edges: Edge[]): string {
  const targets = new Set(edges.map((e) => e.target))
  const roots = nodes.filter((n) => !targets.has(n.id))
  if (roots.length <= 1) return roots[0]?.id ?? nodes[0]?.id ?? ''

  const adj = new Map<string, string[]>()
  for (const n of nodes) adj.set(n.id, [])
  for (const e of edges) adj.get(e.source)?.push(e.target)

  let bestId = roots[0]!.id
  let bestCount = 0
  for (const root of roots) {
    const visited = new Set<string>()
    const queue = [root.id]
    while (queue.length > 0) {
      const id = queue.shift()!
      if (!visited.has(id)) { visited.add(id); for (const n of adj.get(id) ?? []) queue.push(n) }
    }
    if (visited.size > bestCount) { bestCount = visited.size; bestId = root.id }
  }
  return bestId
}

export function simulateWorkflow(nodes: FlowNode[], edges: Edge[]): SimulationResult {
  const issues: SimulationIssue[] = []
  const paths: SimulationPath[] = []
  const allVisitedNodeIds = new Set<string>()

  if (nodes.length === 0) {
    issues.push({ nodeId: '', nodeName: '', message: 'No nodes in workflow' })
    return { paths: [], issues, nodesVisited: 0, unreachedNodeIds: [], status: 'has-issues' }
  }

  const nodeMap = new Map<string, FlowNode>()
  for (const node of nodes) nodeMap.set(node.id, node)

  const outEdges = new Map<string, Edge[]>()
  for (const node of nodes) outEdges.set(node.id, [])
  for (const edge of edges) {
    outEdges.get(edge.source)?.push(edge)
  }

  let pathCount = 0

  function dfs(
    nodeId: string,
    steps: SimulationStep[],
    labelParts: string[],
    visited: Set<string>,
  ) {
    if (pathCount >= MAX_PATHS) return

    const node = nodeMap.get(nodeId)
    if (!node) return

    if (visited.has(nodeId)) {
      issues.push({
        nodeId,
        nodeName: node.data.irNode.name,
        message: `Cycle detected at node "${node.data.irNode.name}"`,
      })
      // Finalize incomplete path
      pathCount++
      if (pathCount <= MAX_PATHS) {
        paths.push({
          id: `path-${pathCount}`,
          label: labelParts.join(' → '),
          steps: [...steps],
          completed: false,
        })
      }
      return
    }

    visited.add(nodeId)
    allVisitedNodeIds.add(nodeId)

    const { status, detail } = getStepDetail(node)
    const step: SimulationStep = {
      nodeId,
      nodeName: node.data.irNode.name,
      nodeType: node.data.irNode.type,
      status,
      detail,
      index: steps.length,
    }
    const newSteps = [...steps, step]
    const newLabel = [...labelParts, node.data.irNode.name]

    const ir = node.data.irNode
    const nodeOutEdges = outEdges.get(nodeId) ?? []

    if (ir.type === 'branch') {
      const branches = (ir.data.branches ?? []) as { label: string; condition: string }[]
      const connectedBranches = branches.filter((b) =>
        nodeOutEdges.some((e) => e.label === b.label),
      )

      if (connectedBranches.length === 0) {
        if (branches.length > 0) {
          issues.push({
            nodeId,
            nodeName: ir.name,
            message: `Branch "${ir.name}" has no connected targets`,
          })
        }
        pathCount++
        if (pathCount <= MAX_PATHS) {
          paths.push({
            id: `path-${pathCount}`,
            label: newLabel.join(' → '),
            steps: newSteps,
            completed: false,
          })
        }
      } else {
        for (const branch of connectedBranches) {
          if (pathCount >= MAX_PATHS) break
          const edge = nodeOutEdges.find((e) => e.label === branch.label)
          if (edge) {
            dfs(
              edge.target,
              newSteps,
              [...newLabel, `[${branch.label}]`],
              new Set(visited),
            )
          }
        }
      }
    } else if (ir.type === 'parallel') {
      if (nodeOutEdges.length === 0) {
        issues.push({
          nodeId,
          nodeName: ir.name,
          message: `Parallel "${ir.name}" has no outgoing edges`,
        })
        pathCount++
        if (pathCount <= MAX_PATHS) {
          paths.push({
            id: `path-${pathCount}`,
            label: newLabel.join(' → '),
            steps: newSteps,
            completed: false,
          })
        }
      } else {
        for (const edge of nodeOutEdges) {
          if (pathCount >= MAX_PATHS) break
          const targetNode = nodeMap.get(edge.target)
          const targetName = targetNode?.data.irNode.name ?? edge.target
          dfs(
            edge.target,
            newSteps,
            [...newLabel, `[parallel: ${targetName}]`],
            new Set(visited),
          )
        }
      }
    } else {
      // Linear node — follow single outgoing edge or finalize
      if (nodeOutEdges.length === 0) {
        pathCount++
        if (pathCount <= MAX_PATHS) {
          paths.push({
            id: `path-${pathCount}`,
            label: newLabel.join(' → '),
            steps: newSteps,
            completed: true,
          })
        }
      } else {
        // Follow first outgoing edge (linear nodes should have at most one)
        dfs(nodeOutEdges[0]!.target, newSteps, newLabel, new Set(visited))
      }
    }
  }

  const entryId = findSimulationEntry(nodes, edges)
  dfs(entryId, [], [], new Set())

  if (pathCount >= MAX_PATHS) {
    issues.push({
      nodeId: '',
      nodeName: '',
      message: `Path explosion: exceeded maximum of ${MAX_PATHS} paths`,
    })
  }

  const unreachedNodeIds = nodes
    .filter((n) => !allVisitedNodeIds.has(n.id))
    .map((n) => n.id)

  for (const nodeId of unreachedNodeIds) {
    const node = nodeMap.get(nodeId)
    if (node) {
      issues.push({
        nodeId,
        nodeName: node.data.irNode.name,
        message: `"${node.data.irNode.name}" is not reachable — connect it or remove it`,
      })
    }
  }

  return {
    paths,
    issues,
    nodesVisited: allVisitedNodeIds.size,
    unreachedNodeIds,
    status: issues.length > 0 ? 'has-issues' : 'success',
  }
}
