import { create } from 'zustand'
import {
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
  type Connection,
} from '@xyflow/react'
import type { WorkflowNode, NodeType, WorkflowMetadata, ConfigField } from '@awaitstep/ir'
import { validateWorkflowForPublish, type PublishValidationResult } from '../lib/validate-workflow'
import type { NodeRegistry } from '@awaitstep/ir'
import { simulateWorkflow, type SimulationResult } from '../lib/simulate-workflow'
import { customAlphabet } from 'nanoid'

const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789_', 12)

const MULTI_EDGE_TYPES = new Set(['branch', 'parallel', 'try_catch', 'loop', 'race'])

const BUILTIN_FLOW_TYPES = new Set([
  'step',
  'sleep',
  'sleep_until',
  'branch',
  'parallel',
  'http_request',
  'wait_for_event',
  'try_catch',
  'loop',
  'break',
  'sub_workflow',
  'race',
])

export function toFlowType(irType: string): string {
  return BUILTIN_FLOW_TYPES.has(irType) ? irType : 'custom'
}

export interface WorkflowNodeData extends Record<string, unknown> {
  irNode: WorkflowNode
}

export type FlowNode = Node<WorkflowNodeData>

export interface WorkflowEnvVar {
  name: string
  value: string
}

export interface DeployConfig {
  route?: {
    pattern: string
    zoneName: string
  }
}

const getInitialWorkflowState = () => ({
  workflowId: null,
  metadata: {
    name: 'Untitled Workflow',
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  nodes: [],
  edges: [],
  selectedNodeId: null,
  selectedEdgeId: null,
  workflowEnvVars: [],
  dependencies: {},
  triggerCode: '',
  deployConfig: {},
  showSettings: false,
  validationResult: null,
  simulationResult: null,
  isDirty: false,
  readOnly: false,
})

interface WorkflowState {
  workflowId: string | null
  metadata: WorkflowMetadata
  nodes: FlowNode[]
  edges: Edge[]
  selectedNodeId: string | null
  selectedEdgeId: string | null
  workflowEnvVars: WorkflowEnvVar[]
  dependencies: Record<string, string>
  triggerCode: string
  deployConfig: DeployConfig
  showSettings: boolean
  validationResult: PublishValidationResult | null
  simulationResult: SimulationResult | null
  isDirty: boolean
  readOnly: boolean

  onNodesChange: OnNodesChange<FlowNode>
  onEdgesChange: OnEdgesChange
  onConnect: (connection: Connection) => void

  addNode: (type: NodeType, position: { x: number; y: number }, registry?: NodeRegistry) => void
  insertNodeOnEdge: (
    type: NodeType,
    position: { x: number; y: number },
    edgeId: string,
    registry?: NodeRegistry,
  ) => void
  updateNodeData: (nodeId: string, data: Partial<WorkflowNode>) => void
  removeNode: (nodeId: string) => void
  selectNode: (nodeId: string | null) => void
  selectEdge: (edgeId: string | null) => void

  setMetadata: (metadata: Partial<WorkflowMetadata>) => void
  setWorkflowEnvVars: (vars: WorkflowEnvVar[]) => void
  setDependencies: (deps: Record<string, string>) => void
  setTriggerCode: (code: string) => void
  setDeployConfig: (config: DeployConfig) => void
  setShowSettings: (show: boolean) => void
  runValidation: (nodeRegistry?: NodeRegistry) => PublishValidationResult
  clearValidation: () => void
  runSimulation: () => SimulationResult
  clearSimulation: () => void
  loadWorkflow: (metadata: WorkflowMetadata, nodes: FlowNode[], edges: Edge[]) => void
  setWorkflowId: (id: string | null) => void
  markClean: () => void
  reset: () => void
}

function configDefaults(schema?: Record<string, ConfigField>): Record<string, unknown> {
  if (!schema) return {}
  const data: Record<string, unknown> = {}
  for (const [key, field] of Object.entries(schema)) {
    if (field.default !== undefined) {
      data[key] = field.default
    }
  }
  return data
}

function createDefaultNode(
  type: NodeType,
  position: { x: number; y: number },
  registry?: NodeRegistry,
): WorkflowNode {
  const id = nanoid()
  const base = { id, type, position, name: `New ${type}`, version: '1.0.0', provider: 'cloudflare' }

  switch (type) {
    case 'step':
      return {
        ...base,
        data: { code: '// Write your business logic here\n\nreturn { result: "ok" };' },
      }
    case 'sleep':
      return { ...base, data: { duration: '10 seconds' } }
    case 'sleep_until':
      return { ...base, data: { timestamp: new Date().toISOString() } }
    case 'branch':
      return {
        ...base,
        data: {
          branches: [
            { label: 'true', condition: 'true' },
            { label: 'false', condition: '' },
          ],
        },
      }
    case 'parallel':
      return { ...base, data: {} }
    case 'http_request':
      return { ...base, data: { url: 'https://api.example.com', method: 'GET' } }
    case 'wait_for_event':
      return { ...base, data: { eventType: 'my-event', timeout: '24 hours' } }
    case 'try_catch':
      return { ...base, data: {} }
    case 'loop':
      return {
        ...base,
        data: {
          loopType: 'forEach',
          collection: '',
          itemVar: 'item',
          indexVar: 'i',
        },
      }
    case 'break':
      return { ...base, name: 'New exit', data: { condition: '' } }
    case 'race':
      return { ...base, data: {} }
    case 'sub_workflow':
      return {
        ...base,
        data: {
          workflowId: '',
          workflowName: '',
          input: '',
          waitForCompletion: true,
          timeout: '5 minutes',
        },
      }
    default: {
      const def = registry?.get(type)
      return { ...base, name: def?.name ?? `New ${type}`, data: configDefaults(def?.configSchema) }
    }
  }
}

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
  ...getInitialWorkflowState(),
  onNodesChange: (changes) => {
    if (get().readOnly) {
      // In read-only mode, only allow selection changes
      const allowed = changes.filter(
        (c) =>
          c.type === 'select' ||
          c.type === 'dimensions' ||
          (c.type === 'position' && !('dragging' in c && c.dragging)),
      )
      if (allowed.length > 0) set({ nodes: applyNodeChanges(allowed, get().nodes) })
      return
    }
    const hasDirtyChange = changes.some(
      (c) =>
        c.type === 'add' ||
        c.type === 'remove' ||
        c.type === 'replace' ||
        (c.type === 'position' && c.dragging),
    )
    const removedIds = new Set(changes.filter((c) => c.type === 'remove').map((c) => c.id))
    const selectedNodeId = removedIds.has(get().selectedNodeId ?? '') ? null : undefined
    set({
      nodes: applyNodeChanges(changes, get().nodes),
      ...(hasDirtyChange && { isDirty: true }),
      ...(selectedNodeId === null && { selectedNodeId: null }),
    })
  },

  onEdgesChange: (changes) => {
    if (get().readOnly) return
    if (changes.length === 0) return
    const dirtyTypes = new Set(['add', 'remove', 'replace'])
    const hasDirtyChange = changes.some((c) => dirtyTypes.has(c.type))
    set({
      edges: applyEdgeChanges(changes, get().edges),
      ...(hasDirtyChange && { isDirty: true }),
    })
  },

  onConnect: (connection) => {
    if (get().readOnly) return
    const { nodes, edges } = get()
    const sourceNode = nodes.find((n) => n.id === connection.source)
    if (!sourceNode) {
      set({ edges: addEdge({ ...connection, id: nanoid() }, edges), isDirty: true })
      return
    }

    const type = sourceNode.data.irNode.type

    // Collect outgoing edges once — used by both linear check and label logic
    let outgoing: typeof edges | undefined
    if (MULTI_EDGE_TYPES.has(type)) {
      outgoing = edges.filter((e) => e.source === connection.source)
    } else {
      if (edges.some((e) => e.source === connection.source)) return
    }

    // Auto-label edges from container nodes
    let label: string | undefined
    if (type === 'loop') {
      const labels = new Set(outgoing!.map((e) => e.label))
      if (!labels.has('body')) label = 'body'
      else if (!labels.has('then')) label = 'then'
      else return
    } else if (type === 'break') {
      if (outgoing!.length > 0) return
      if (String(sourceNode.data.irNode.data.condition ?? '').trim()) label = 'else'
    } else if (type === 'try_catch') {
      const labels = new Set(outgoing!.map((e) => e.label))
      if (!labels.has('try')) label = 'try'
      else if (!labels.has('catch')) label = 'catch'
      else if (!labels.has('finally')) label = 'finally'
      else if (!labels.has('then')) label = 'then'
      else return
    }

    const newEdge = { ...connection, id: nanoid(), ...(label ? { label } : {}) }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- addEdge's internal type is stricter than Edge[]
    set({ edges: addEdge(newEdge, edges as any) as Edge[], isDirty: true })
  },

  addNode: (type, position, registry) => {
    if (get().readOnly) return
    const irNode = createDefaultNode(type, position, registry)
    const flowNode: FlowNode = {
      id: irNode.id,
      type: toFlowType(irNode.type),
      position,
      data: { irNode },
    }
    set({ nodes: [...get().nodes, flowNode], isDirty: true })
  },

  insertNodeOnEdge: (type, position, edgeId, registry) => {
    if (get().readOnly) return
    const { edges, nodes } = get()
    const edge = edges.find((e) => e.id === edgeId)
    if (!edge) return

    const irNode = createDefaultNode(type, position, registry)
    const flowNode: FlowNode = {
      id: irNode.id,
      type: toFlowType(irNode.type),
      position,
      data: { irNode },
    }

    const newEdges = edges.filter((e) => e.id !== edgeId)
    newEdges.push(
      { id: nanoid(), source: edge.source, target: irNode.id, label: edge.label },
      { id: nanoid(), source: irNode.id, target: edge.target },
    )

    set({ nodes: [...nodes, flowNode], edges: newEdges, isDirty: true })
  },

  updateNodeData: (nodeId, data) => {
    if (get().readOnly) return
    const currentNode = get().nodes.find((n) => n.id === nodeId)
    const updatedIrNode = currentNode
      ? ({ ...currentNode.data.irNode, ...data } as WorkflowNode)
      : null

    // Sync edge labels when branch labels change
    let edges = get().edges
    if (
      updatedIrNode?.type === 'branch' &&
      'data' in data &&
      data.data &&
      'branches' in (data.data as Record<string, unknown>)
    ) {
      const oldBranches = (currentNode?.data.irNode.data.branches ?? []) as { label: string }[]
      const newBranches = (updatedIrNode.data.branches ?? []) as { label: string }[]
      edges = edges.map((edge) => {
        if (edge.source !== nodeId) return edge
        const oldIndex = oldBranches.findIndex((b) => b.label === edge.label)
        if (oldIndex >= 0 && newBranches[oldIndex]) {
          return { ...edge, label: newBranches[oldIndex].label }
        }
        return edge
      })
    }

    set({
      nodes: get().nodes.map((node) => {
        if (node.id !== nodeId) return node
        return {
          ...node,
          data: {
            ...node.data,
            irNode: updatedIrNode!,
          },
        }
      }),
      edges,
      isDirty: true,
    })
  },

  removeNode: (nodeId) => {
    if (get().readOnly) return
    set({
      nodes: get().nodes.filter((n) => n.id !== nodeId),
      edges: get().edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
      selectedNodeId: get().selectedNodeId === nodeId ? null : get().selectedNodeId,
      isDirty: true,
    })
  },

  selectNode: (nodeId) => {
    set({ selectedNodeId: nodeId, selectedEdgeId: null })
  },

  selectEdge: (edgeId) => {
    set({ selectedEdgeId: edgeId, selectedNodeId: null })
  },

  setMetadata: (metadata) => {
    set({
      metadata: { ...get().metadata, ...metadata, updatedAt: new Date().toISOString() },
      isDirty: true,
    })
  },

  setWorkflowEnvVars: (vars) => {
    set({ workflowEnvVars: vars, isDirty: true })
  },

  setDependencies: (deps) => {
    set({ dependencies: deps, isDirty: true })
  },

  setTriggerCode: (code) => {
    set({ triggerCode: code, isDirty: true })
  },

  setDeployConfig: (config) => {
    set({ deployConfig: config, isDirty: true })
  },

  setShowSettings: (show) => {
    set({ showSettings: show, selectedNodeId: show ? null : get().selectedNodeId })
  },

  runValidation: (nodeRegistry?: NodeRegistry) => {
    const { metadata, nodes, edges, workflowEnvVars } = get()
    const settings = { workflowEnvVars }
    const result = validateWorkflowForPublish(metadata, nodes, edges, nodeRegistry, settings)
    set({ validationResult: result, simulationResult: null })
    return result
  },

  clearValidation: () => {
    set({ validationResult: null })
  },

  runSimulation: () => {
    const { nodes, edges } = get()
    const result = simulateWorkflow(nodes, edges)
    set({ simulationResult: result, validationResult: null })
    return result
  },

  clearSimulation: () => {
    set({ simulationResult: null })
  },

  loadWorkflow: (metadata, nodes, edges) => {
    const fixedNodes = nodes.map((n) => ({ ...n, type: toFlowType(n.data.irNode.type) }))
    set({ metadata, nodes: fixedNodes, edges, isDirty: false })
  },

  setWorkflowId: (id) => {
    set({ workflowId: id })
  },

  markClean: () => {
    set({ isDirty: false })
  },

  reset: () => {
    set(getInitialWorkflowState())
  },
}))
