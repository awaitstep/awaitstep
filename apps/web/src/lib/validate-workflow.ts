import type { Edge } from '@xyflow/react'
import type { WorkflowMetadata, BranchCondition } from '@awaitstep/ir'
import { validateExpressionRefs, type NodeRegistry } from '@awaitstep/ir'
import type { FlowNode, WorkflowEnvVar } from '../stores/workflow-store'
import { z } from 'zod'

export type IssueSeverity = 'error' | 'warning'

export interface PublishIssue {
  severity: IssueSeverity
  nodeId: string | null
  nodeName: string | null
  message: string
}

export interface PublishValidationResult {
  issues: PublishIssue[]
  canPublish: boolean
}

export interface WorkflowSettings {
  workflowEnvVars: WorkflowEnvVar[]
}

const workflowEnvVarSchema = z.object({
  name: z.string().min(1, 'Environment variable name is empty'),
  value: z.string(),
})

export const workflowSettingsSchema = z.object({
  workflowEnvVars: z.array(workflowEnvVarSchema),
})

const NESTED_STEP_PATTERN = /step\.(do|sleep|sleepUntil|waitForEvent)\s*\(/
const EVENT_TYPE_PATTERN = /^[a-zA-Z0-9_-]+$/

const UNIT_TO_SECONDS: Record<string, number> = {
  second: 1,
  seconds: 1,
  minute: 60,
  minutes: 60,
  hour: 3600,
  hours: 3600,
  day: 86400,
  days: 86400,
}

const MAX_SECONDS = 365 * 86400

function parseDurationToSeconds(value: string | number): number {
  if (typeof value === 'number') return value
  const match = value.match(/^(\d+)\s*(.+)$/)
  if (!match) return 0
  const amount = Number(match[1])
  const unit = match[2]!.trim().toLowerCase()
  const unitSeconds = UNIT_TO_SECONDS[unit] ?? 0
  return amount * unitSeconds
}

function hasCycle(nodes: FlowNode[], edges: Edge[]): boolean {
  const adj = new Map<string, string[]>()
  for (const node of nodes) adj.set(node.id, [])
  for (const edge of edges) {
    adj.get(edge.source)?.push(edge.target)
  }

  const visited = new Set<string>()
  const stack = new Set<string>()

  function dfs(nodeId: string): boolean {
    if (stack.has(nodeId)) return true
    if (visited.has(nodeId)) return false
    visited.add(nodeId)
    stack.add(nodeId)
    for (const neighbor of adj.get(nodeId) ?? []) {
      if (dfs(neighbor)) return true
    }
    stack.delete(nodeId)
    return false
  }

  for (const node of nodes) {
    if (dfs(node.id)) return true
  }
  return false
}

function findEntryNode(nodes: FlowNode[], edges: Edge[]): string {
  const targets = new Set(edges.map((e) => e.target))
  const roots = nodes.filter((n) => !targets.has(n.id))
  if (roots.length <= 1) return roots[0]?.id ?? nodes[0]?.id ?? ''

  // Multiple roots — pick the one with the most descendants
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
      if (!visited.has(id)) {
        visited.add(id)
        for (const n of adj.get(id) ?? []) queue.push(n)
      }
    }
    if (visited.size > bestCount) {
      bestCount = visited.size
      bestId = root.id
    }
  }
  return bestId
}

function findUnreachableNodes(nodes: FlowNode[], edges: Edge[]): Set<string> {
  if (nodes.length === 0) return new Set()

  const adj = new Map<string, string[]>()
  for (const node of nodes) adj.set(node.id, [])
  for (const edge of edges) {
    adj.get(edge.source)?.push(edge.target)
  }

  const entryId = findEntryNode(nodes, edges)
  const reachable = new Set<string>()
  const queue = [entryId]
  reachable.add(entryId)

  while (queue.length > 0) {
    const current = queue.shift()!
    for (const neighbor of adj.get(current) ?? []) {
      if (!reachable.has(neighbor)) {
        reachable.add(neighbor)
        queue.push(neighbor)
      }
    }
  }

  const unreachable = new Set<string>()
  for (const node of nodes) {
    if (!reachable.has(node.id)) unreachable.add(node.id)
  }
  return unreachable
}

export function validateWorkflowForPublish(
  metadata: Pick<WorkflowMetadata, 'name' | 'description'>,
  nodes: FlowNode[],
  edges: Edge[],
  nodeRegistry?: NodeRegistry,
  settings?: WorkflowSettings,
): PublishValidationResult {
  const issues: PublishIssue[] = []

  function add(
    severity: IssueSeverity,
    nodeId: string | null,
    nodeName: string | null,
    message: string,
  ) {
    issues.push({ severity, nodeId, nodeName, message })
  }

  // ── Workflow-level ──
  if (!metadata.name.trim()) {
    add('error', null, null, 'Workflow name is empty')
  }

  // ── Settings validation ──
  if (settings) {
    const result = workflowSettingsSchema.safeParse(settings)
    if (!result.success) {
      for (const issue of result.error.issues) {
        add('error', null, null, issue.message)
      }
    }

    const envVarNames = new Set<string>()
    for (const envVar of settings.workflowEnvVars) {
      if (envVar.name && envVarNames.has(envVar.name)) {
        add('error', null, null, `Duplicate environment variable name: "${envVar.name}"`)
      }
      envVarNames.add(envVar.name)
    }
  }

  if (nodes.length === 0) {
    add('error', null, null, 'No nodes in workflow')
    return { issues, canPublish: false }
  }

  if (hasCycle(nodes, edges)) {
    add('error', null, null, 'Graph contains a cycle')
  }

  const unreachable = findUnreachableNodes(nodes, edges)
  for (const nodeId of unreachable) {
    const node = nodes.find((n) => n.id === nodeId)
    add(
      'error',
      nodeId,
      node?.data.irNode.name ?? null,
      'Node is not reachable from entry — connect it or remove it',
    )
  }

  // ── Expression validation setup (topo-sort for upstream tracking) ──
  const allNodeIds = new Set(nodes.map((n) => n.id))
  const nodeAdj = new Map<string, string[]>()
  const inDegree = new Map<string, number>()
  for (const node of nodes) {
    nodeAdj.set(node.id, [])
    inDegree.set(node.id, 0)
  }
  for (const edge of edges) {
    nodeAdj.get(edge.source)?.push(edge.target)
    inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1)
  }
  const topoQueue: string[] = []
  for (const [nodeId, degree] of inDegree) {
    if (degree === 0) topoQueue.push(nodeId)
  }
  const topoOrder: string[] = []
  while (topoQueue.length > 0) {
    const current = topoQueue.shift()!
    topoOrder.push(current)
    for (const neighbor of nodeAdj.get(current) ?? []) {
      const newDeg = (inDegree.get(neighbor) ?? 1) - 1
      inDegree.set(neighbor, newDeg)
      if (newDeg === 0) topoQueue.push(neighbor)
    }
  }
  const upstreamSets = new Map<string, Set<string>>()
  const seen = new Set<string>()
  for (const nodeId of topoOrder) {
    upstreamSets.set(nodeId, new Set(seen))
    seen.add(nodeId)
  }

  // ── Per-node ──
  const BUILTIN_TYPES = new Set([
    'step',
    'sleep',
    'sleep_until',
    'branch',
    'parallel',
    'http_request',
    'wait_for_event',
  ])
  const LINEAR_TYPES = new Set([
    'step',
    'sleep',
    'sleep_until',
    'http_request',
    'wait_for_event',
    'custom',
  ])

  for (const node of nodes) {
    const ir = node.data.irNode
    const name = ir.name
    const id = node.id

    // Missing node definition check
    if (!BUILTIN_TYPES.has(ir.type) && nodeRegistry && !nodeRegistry.has(ir.type)) {
      add('error', id, name, `Unknown node type "${ir.type}" — definition not found in registry`)
    }

    // Linear nodes must have at most 1 outgoing edge
    if (LINEAR_TYPES.has(ir.type)) {
      const outCount = edges.filter((e) => e.source === id).length
      if (outCount > 1) {
        add(
          'error',
          id,
          name,
          `Node has ${outCount} outgoing edges but only 1 is allowed — use a Branch node to split`,
        )
      }
    }

    switch (ir.type) {
      case 'step': {
        if (!ir.name.trim()) add('error', id, name, 'Step name is empty')
        const code = String(ir.data.code ?? '')
        if (!code.trim()) add('error', id, name, 'Step code is empty')
        if (NESTED_STEP_PATTERN.test(code)) {
          add('error', id, name, 'Nested step call detected in code body')
        }
        break
      }

      case 'sleep': {
        const seconds = parseDurationToSeconds(ir.data.duration as string | number)
        if (seconds <= 0) add('error', id, name, 'Duration is 0 or negative')
        if (seconds > MAX_SECONDS) add('error', id, name, 'Duration exceeds 365 days')
        break
      }

      case 'sleep_until': {
        const timestamp = String(ir.data.timestamp ?? '')
        if (!timestamp.trim()) {
          add('error', id, name, 'Timestamp is empty')
        } else if (isNaN(Date.parse(timestamp))) {
          add('error', id, name, 'Timestamp is not a valid date')
        }
        break
      }

      case 'branch': {
        const branches = (ir.data.branches ?? []) as BranchCondition[]
        if (branches.length < 2) {
          add('error', id, name, 'Fewer than 2 branches')
        }

        const labels = branches.map((b) => b.label)
        const seen = new Set<string>()
        for (const label of labels) {
          if (seen.has(label)) {
            add('error', id, name, `Duplicate branch label: "${label}"`)
            break
          }
          seen.add(label)
        }

        const outEdges = edges.filter((e) => e.source === id)
        for (const branch of branches) {
          if (branch.condition.trim() && !outEdges.some((e) => e.label === branch.label)) {
            add('error', id, name, `Branch "${branch.label}" has no connected target`)
          }
        }

        const lastBranch = branches[branches.length - 1]
        if (lastBranch && lastBranch.condition.trim() !== '') {
          add('warning', id, name, 'No default/else branch')
        }
        break
      }

      case 'parallel': {
        const outEdges = edges.filter((e) => e.source === id)
        if (outEdges.length === 0) {
          add('error', id, name, '0 outgoing edges')
        } else if (outEdges.length === 1) {
          add('warning', id, name, 'Only 1 outgoing edge')
        }
        break
      }

      case 'http_request': {
        const url = String(ir.data.url ?? '')
        if (!url.trim()) add('error', id, name, 'URL is empty')
        if (!ir.data.method) add('error', id, name, 'Method is missing')
        break
      }

      case 'wait_for_event': {
        const eventType = String(ir.data.eventType ?? '')
        if (!eventType.trim()) {
          add('error', id, name, 'Event type is empty')
        } else if (!EVENT_TYPE_PATTERN.test(eventType)) {
          add('error', id, name, 'Event type has invalid characters')
        }
        break
      }
    }

    // ── Template expression validation ──
    const upstream = upstreamSets.get(id) ?? new Set()
    const stringsToCheck: string[] = []
    for (const v of Object.values(ir.data)) {
      if (typeof v === 'string') stringsToCheck.push(v)
    }
    for (const s of stringsToCheck) {
      const exprErrors = validateExpressionRefs(s, id, upstream, allNodeIds)
      for (const err of exprErrors) {
        add('error', id, name, err.message)
      }
    }
  }

  return {
    issues,
    canPublish: !issues.some((i) => i.severity === 'error'),
  }
}
