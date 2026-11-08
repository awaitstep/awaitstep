import type { Edge } from '@xyflow/react'
import type { WorkflowMetadata, BranchCondition } from '@awaitstep/ir'
import {
  validateExpressionRefs,
  SCRIPT_INCOMPATIBLE_NODE_TYPES,
  type NodeRegistry,
} from '@awaitstep/ir'
import type { FlowNode, WorkflowEnvVar } from '../stores/workflow-store'
import { computeUpstreamSets } from './expressions/upstream'
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

export const EMPTY_WORKFLOW_MESSAGE = 'The workflow is empty. Add a node to start.'

/**
 * True when the empty graph is the only thing standing in the way: every
 * error is the "workflow is empty" one. Settings (name, variables) of a
 * workflow with nothing drawn can still be stored, just not as a version.
 */
export function onlyBlockedByEmptyGraph(result: PublishValidationResult): boolean {
  const errors = result.issues.filter((issue) => issue.severity === 'error')
  return errors.length > 0 && errors.every((issue) => issue.message === EMPTY_WORKFLOW_MESSAGE)
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
  kind: 'workflow' | 'script' = 'workflow',
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
        add(
          'error',
          null,
          null,
          `"${envVar.name}" is used for more than one environment variable. Rename one.`,
        )
      }
      envVarNames.add(envVar.name)
    }
  }

  if (nodes.length === 0) {
    add('error', null, null, EMPTY_WORKFLOW_MESSAGE)
    return { issues, canPublish: false }
  }

  if (hasCycle(nodes, edges)) {
    add(
      'error',
      null,
      null,
      'The workflow loops back on itself. Remove a connection to break the loop.',
    )
  }

  const unreachable = findUnreachableNodes(nodes, edges)
  for (const nodeId of unreachable) {
    const node = nodes.find((n) => n.id === nodeId)
    add(
      'error',
      nodeId,
      node?.data.irNode.name ?? null,
      'Not connected to the rest of the workflow. Connect it or remove it.',
    )
  }

  // ── Expression validation setup (topo-sort for upstream tracking) ──
  const allNodeIds = new Set(nodes.map((n) => n.id))
  const upstreamSets = computeUpstreamSets(nodes, edges)

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
      add('error', id, name, `Node type "${ir.type}" isn’t installed.`)
    }

    // Script-incompatibility check — scripts run in a fetch handler with no
    // durable runtime, so any node that requires one (sleep, sleep_until,
    // wait_for_event) is rejected up-front. Backend enforces the same rule
    // in @awaitstep/ir's validateScript.
    if (kind === 'script' && SCRIPT_INCOMPATIBLE_NODE_TYPES.has(ir.type)) {
      add(
        'error',
        id,
        name,
        `Node type "${ir.type}" needs a durable runtime, and scripts only support stateless steps. Use a workflow instead.`,
      )
    }

    // Linear nodes must have at most 1 outgoing edge
    if (LINEAR_TYPES.has(ir.type)) {
      const outCount = edges.filter((e) => e.source === id).length
      if (outCount > 1) {
        add(
          'error',
          id,
          name,
          `Only one connection can leave this node. Use a Branch node to split.`,
        )
      }
    }

    switch (ir.type) {
      case 'step': {
        if (!ir.name.trim()) add('error', id, name, 'Step name is empty')
        const code = String(ir.data.code ?? '')
        if (!code.trim()) add('error', id, name, 'Step code is empty')
        if (NESTED_STEP_PATTERN.test(code)) {
          add(
            'error',
            id,
            name,
            'This code calls a step inside a step. Move the inner call into its own node.',
          )
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
          add('error', id, name, 'Timestamp isn’t a valid date')
        }
        break
      }

      case 'branch': {
        const branches = (ir.data.branches ?? []) as BranchCondition[]
        // A branch with no branches at all isn't useful — it'd emit nothing.
        // A single-branch case (`if (cond) { ... }` with no else) IS valid.
        if (branches.length < 1) {
          add('error', id, name, 'Branch has no conditions')
        }

        const labels = branches.map((b) => b.label)
        const seen = new Set<string>()
        for (const label of labels) {
          if (seen.has(label)) {
            add('error', id, name, `Two branches are labeled "${label}". Give each a unique label.`)
            break
          }
          seen.add(label)
        }

        const outEdges = edges.filter((e) => e.source === id)
        for (const branch of branches) {
          if (branch.condition.trim() && !outEdges.some((e) => e.label === branch.label)) {
            add(
              'error',
              id,
              name,
              `Branch "${branch.label}" has no connection. Connect it or remove the branch.`,
            )
          }
        }

        const lastBranch = branches[branches.length - 1]
        if (lastBranch && lastBranch.condition.trim() !== '') {
          add('warning', id, name, 'Add a last branch with no condition to cover every other case.')
        }
        break
      }

      case 'parallel': {
        const outEdges = edges.filter((e) => e.source === id)
        if (outEdges.length === 0) {
          add(
            'error',
            id,
            name,
            'Nothing is connected to this node. Connect the nodes to run at the same time.',
          )
        } else if (outEdges.length === 1) {
          add(
            'warning',
            id,
            name,
            'Only one node is connected. Connect at least two to run them at the same time.',
          )
        }
        break
      }

      case 'sub_workflow': {
        const workflow = String(ir.data.workflowName ?? '')
        const explicit = (ir.data.params as { cf?: { binding?: unknown } } | undefined)?.cf?.binding
        if (!workflow.trim() && typeof explicit !== 'string') {
          add('warning', id, name, 'Select a workflow to deploy.')
        }
        break
      }

      case 'sub_script': {
        // A warning, not an error: an unconfigured node must stay saveable
        // mid-authoring. The deploy refuses it — the provider derives an Env
        // binding from the script name and cannot do that from nothing.
        const script = String(ir.data.scriptId ?? ir.data.workerName ?? '')
        if (!script.trim()) add('warning', id, name, 'Select a script to deploy.')
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
