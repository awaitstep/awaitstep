import { create } from 'zustand'
import { temporal, type TemporalState } from 'zundo'
import { useStore } from 'zustand'
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
import type {
  BindingDeclaration,
  WorkflowNode,
  NodeType,
  WorkflowMetadata,
  ConfigField,
} from '@awaitstep/ir'
import { validateWorkflowForPublish, type PublishValidationResult } from '../lib/validate-workflow'
import { fallbackPosition } from '../lib/hydrate-workflow'
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
  'sub_script',
  'race',
])

export function toFlowType(irType: string): string {
  return BUILTIN_FLOW_TYPES.has(irType) ? irType : 'custom'
}

const CLIPBOARD_FORMAT = 'awaitstep/nodes-v1'

interface ClipboardEdge {
  source: string
  target: string
  label?: string
}

interface ClipboardPayload {
  __awaitstep: typeof CLIPBOARD_FORMAT
  nodes: WorkflowNode[]
  edges: ClipboardEdge[]
}

function isClipboardPayload(value: unknown): value is ClipboardPayload {
  if (typeof value !== 'object' || value === null) return false
  const obj = value as Record<string, unknown>
  return (
    obj.__awaitstep === CLIPBOARD_FORMAT && Array.isArray(obj.nodes) && Array.isArray(obj.edges)
  )
}

function buildClipboardPayload(
  nodes: FlowNode[],
  edges: Edge[],
  nodeIds: string[],
): ClipboardPayload | null {
  const idSet = new Set(nodeIds)
  const sourceNodes = nodes.filter((n) => idSet.has(n.id)).map((n) => n.data.irNode)
  if (sourceNodes.length === 0) return null
  const sourceEdges = edges
    .filter((e) => idSet.has(e.source) && idSet.has(e.target))
    .map<ClipboardEdge>((e) => ({
      source: e.source,
      target: e.target,
      ...(typeof e.label === 'string' ? { label: e.label } : {}),
    }))
  return { __awaitstep: CLIPBOARD_FORMAT, nodes: sourceNodes, edges: sourceEdges }
}

function instantiateClones(
  payload: ClipboardPayload,
  offset: { x: number; y: number },
): { nodes: FlowNode[]; edges: Edge[] } {
  const idMap = new Map<string, string>()
  const newNodes: FlowNode[] = payload.nodes.map((src, i) => {
    const newId = nanoid()
    idMap.set(src.id, newId)
    const base = src.position ?? fallbackPosition(i)
    const position = { x: base.x + offset.x, y: base.y + offset.y }
    const irNode: WorkflowNode = { ...structuredClone(src), id: newId, position }
    return { id: newId, type: toFlowType(irNode.type), position, data: { irNode } }
  })
  const newEdges: Edge[] = payload.edges
    .filter((e) => idMap.has(e.source) && idMap.has(e.target))
    .map((e) => ({
      id: nanoid(),
      source: idMap.get(e.source)!,
      target: idMap.get(e.target)!,
      ...(e.label ? { label: e.label } : {}),
    }))
  return { nodes: newNodes, edges: newEdges }
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
  kind: 'workflow' as 'workflow' | 'script',
  metadata: {
    name: 'Untitled Workflow',
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    description: '',
  },
  nodes: [],
  edges: [],
  selectedNodeId: null,
  selectedEdgeId: null,
  workflowEnvVars: [],
  dependencies: {},
  triggerCode: '',
  runtimeBindings: [],
  deployConfig: {},
  showSettings: false,
  validationResult: null,
  simulationResult: null,
  isDirty: false,
  readOnly: false,
})

interface WorkflowState {
  workflowId: string | null
  /** `'workflow'` (default) or `'script'`. Drives codegen shape and UI affordances. */
  kind: 'workflow' | 'script'
  metadata: WorkflowMetadata
  nodes: FlowNode[]
  edges: Edge[]
  selectedNodeId: string | null
  selectedEdgeId: string | null
  workflowEnvVars: WorkflowEnvVar[]
  dependencies: Record<string, string>
  triggerCode: string
  /** Resource binding declarations round-tripped through ir.runtime.bindings. */
  runtimeBindings: BindingDeclaration[]
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
  duplicateNodes: (nodeIds: string[]) => string[]
  copyNodesToClipboard: (nodeIds: string[]) => Promise<boolean>
  pasteNodesFromClipboard: (centerPosition?: { x: number; y: number }) => Promise<string[]>

  setKind: (kind: 'workflow' | 'script') => void
  setMetadata: (metadata: Partial<WorkflowMetadata>) => void
  setWorkflowEnvVars: (vars: WorkflowEnvVar[]) => void
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
    case 'sub_script':
      return {
        ...base,
        name: 'Call Script',
        data: {
          workerName: '',
          method: 'POST',
          url: 'https://invoke/',
          headers: {},
          body: '',
          retryLimit: 3,
        },
      }
    default: {
      const def = registry?.get(type)
      return { ...base, name: def?.name ?? `New ${type}`, data: configDefaults(def?.configSchema) }
    }
  }
}

/**
 * The graph-shaped slice undo/redo tracks. Transient UI state (selection,
 * open panels, validation/simulation results, dirty + readOnly flags) is
 * deliberately excluded: undoing a structural edit must not reopen a panel
 * or resurrect a stale validation report, and selection churn must not
 * consume history entries.
 */
type UndoableState = Pick<
  WorkflowState,
  | 'kind'
  | 'metadata'
  | 'nodes'
  | 'edges'
  | 'workflowEnvVars'
  | 'dependencies'
  | 'triggerCode'
  | 'runtimeBindings'
>

const UNDO_LIMIT = 100

type ZundoHandleSet = NonNullable<
  NonNullable<Parameters<typeof temporal<WorkflowState, [], [], UndoableState>>[1]>['handleSet']
>

/**
 * History tracks the SEMANTIC graph, not React Flow's view objects. React
 * Flow routes every change through onNodesChange — including `select` (a
 * click, or a freshly added node auto-selecting) and `dimensions` (a node
 * mounting and being measured) — and each one yields a fresh nodes array.
 * Tracking those would bury the real edit several entries deep: add → measure
 * → select → drag means four undos to remove one node. So the slice keeps
 * only identity, type, position, data (and the transient dragging flag the
 * drag-collapse anchor needs); restoring it hands React Flow nodes it simply
 * re-measures, with no stale selection.
 */
function undoableNode(node: FlowNode): FlowNode {
  return {
    id: node.id,
    type: node.type,
    position: node.position,
    data: node.data,
    ...(node.dragging !== undefined && { dragging: node.dragging }),
  }
}

function undoableEdge(edge: Edge): Edge {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    ...(edge.label !== undefined && { label: edge.label }),
    ...(edge.type !== undefined && { type: edge.type }),
    ...(edge.sourceHandle != null && { sourceHandle: edge.sourceHandle }),
    ...(edge.targetHandle != null && { targetHandle: edge.targetHandle }),
  }
}

function undoableSlice(state: WorkflowState): UndoableState {
  return {
    kind: state.kind,
    metadata: state.metadata,
    nodes: state.nodes.map(undoableNode),
    edges: state.edges.map(undoableEdge),
    workflowEnvVars: state.workflowEnvVars,
    dependencies: state.dependencies,
    triggerCode: state.triggerCode,
    runtimeBindings: state.runtimeBindings,
  }
}

function sameNodes(a: FlowNode[], b: FlowNode[]): boolean {
  if (a.length !== b.length) return false
  return a.every((node, i) => {
    const other = b[i]!
    return (
      node.id === other.id &&
      node.type === other.type &&
      node.data === other.data &&
      node.position.x === other.position.x &&
      node.position.y === other.position.y &&
      // The drag flag flipping is what lets the drop reach the recorder —
      // without it the final tick (same position, dragging → false) would be
      // skipped as equal and the anchored pre-drag state never recorded.
      (node.dragging ?? false) === (other.dragging ?? false)
    )
  })
}

function sameEdges(a: Edge[], b: Edge[]): boolean {
  if (a.length !== b.length) return false
  return a.every((edge, i) => {
    const other = b[i]!
    return (
      edge.id === other.id &&
      edge.source === other.source &&
      edge.target === other.target &&
      edge.label === other.label &&
      edge.type === other.type &&
      edge.sourceHandle === other.sourceHandle &&
      edge.targetHandle === other.targetHandle
    )
  })
}

/**
 * Nothing in the undoable slice changed — the set only touched excluded UI
 * state (selection, panels, flags), so it must not consume a history entry.
 */
function undoableEquality(past: UndoableState, current: UndoableState): boolean {
  return (
    past.kind === current.kind &&
    past.metadata === current.metadata &&
    sameNodes(past.nodes, current.nodes) &&
    sameEdges(past.edges, current.edges) &&
    past.workflowEnvVars === current.workflowEnvVars &&
    past.dependencies === current.dependencies &&
    past.triggerCode === current.triggerCode &&
    past.runtimeBindings === current.runtimeBindings
  )
}

function isDragInFlight(state: UndoableState): boolean {
  return state.nodes.some((node) => node.dragging === true)
}

/**
 * A drag emits a position change per pointer tick, each carrying
 * `dragging: true` until the drop (React Flow copies the flag onto the
 * node). Recording every tick would bury real edits under hundreds of
 * micro-steps — but skipping them all the way to the drop would record the
 * drag's END state, since zundo records the state preceding each set. So the
 * first in-flight tick anchors the pre-drag state and the drop records that
 * anchor: one entry per drag, and one undo returns the node to where it
 * started. Programmatic position writes carry no dragging flag and record
 * normally.
 */
/**
 * The real runtime shape of zundo's history recorder. zundo types the
 * `handleSet` option in terms of `StoreApi<TState>['setState']`, but it
 * actually hands over `_handleSet`, which takes the partialized past state,
 * the replace flag, the current state and an optional delta. Modeling the
 * true shape here keeps the drag logic type-checked; the single cast lives
 * at the option site.
 */
type HistoryRecorder = (
  pastState: UndoableState,
  replace: boolean | undefined,
  currentState: UndoableState,
  deltaState?: Partial<UndoableState> | null,
) => void

function collapseDrags(record: HistoryRecorder): HistoryRecorder {
  let dragAnchor: UndoableState | null = null
  return (pastState, replace, currentState, deltaState) => {
    if (isDragInFlight(currentState)) {
      dragAnchor ??= pastState
      return
    }
    if (dragAnchor) {
      const anchor = dragAnchor
      dragAnchor = null
      record(anchor, replace, currentState, deltaState)
      return
    }
    record(pastState, replace, currentState, deltaState)
  }
}

export const useWorkflowStore = create<WorkflowState>()(
  temporal<WorkflowState, [], [], UndoableState>(
    (set, get) => ({
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
        } else if (type === 'branch') {
          // Per-branch wiring (yes/no/etc.) is done via the config panel, which
          // sets explicit branch labels. A direct drag from the branch's source
          // handle is for the continuation path that runs after the if/else
          // block returns — auto-label as 'then'. Block if one already exists.
          const labels = new Set(outgoing!.map((e) => e.label))
          if (!labels.has('then')) label = 'then'
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

      duplicateNodes: (nodeIds) => {
        if (get().readOnly || nodeIds.length === 0) return []
        const { nodes, edges } = get()
        const payload = buildClipboardPayload(nodes, edges, nodeIds)
        if (!payload) return []
        const cloned = instantiateClones(payload, { x: 40, y: 40 })
        const newIds = cloned.nodes.map((n) => n.id)
        set({
          nodes: [
            ...nodes.map((n) => (n.selected ? { ...n, selected: false } : n)),
            ...cloned.nodes.map((n) => ({ ...n, selected: true })),
          ],
          edges: [...edges, ...cloned.edges],
          selectedNodeId: newIds[0] ?? null,
          selectedEdgeId: null,
          isDirty: true,
        })
        return newIds
      },

      copyNodesToClipboard: async (nodeIds) => {
        if (nodeIds.length === 0) return false
        const { nodes, edges } = get()
        const payload = buildClipboardPayload(nodes, edges, nodeIds)
        if (!payload) return false
        try {
          await navigator.clipboard.writeText(JSON.stringify(payload))
          return true
        } catch {
          return false
        }
      },

      pasteNodesFromClipboard: async (centerPosition) => {
        if (get().readOnly) return []
        let raw: string
        try {
          raw = await navigator.clipboard.readText()
        } catch {
          return []
        }
        if (!raw) return []
        let parsed: unknown
        try {
          parsed = JSON.parse(raw)
        } catch {
          return []
        }
        if (!isClipboardPayload(parsed)) return []

        let offset: { x: number; y: number }
        if (centerPosition && parsed.nodes.length > 0) {
          const cx =
            parsed.nodes.reduce((s, n, i) => s + (n.position ?? fallbackPosition(i)).x, 0) /
            parsed.nodes.length
          const cy =
            parsed.nodes.reduce((s, n, i) => s + (n.position ?? fallbackPosition(i)).y, 0) /
            parsed.nodes.length
          offset = { x: centerPosition.x - cx, y: centerPosition.y - cy }
        } else {
          offset = { x: 40, y: 40 }
        }

        const cloned = instantiateClones(parsed, offset)
        if (cloned.nodes.length === 0) return []
        const newIds = cloned.nodes.map((n) => n.id)
        const { nodes, edges } = get()
        set({
          nodes: [
            ...nodes.map((n) => (n.selected ? { ...n, selected: false } : n)),
            ...cloned.nodes.map((n) => ({ ...n, selected: true })),
          ],
          edges: [...edges, ...cloned.edges],
          selectedNodeId: newIds[0] ?? null,
          selectedEdgeId: null,
          isDirty: true,
        })
        return newIds
      },

      setKind: (kind) => {
        set({ kind })
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

      setDeployConfig: (config) => {
        set({ deployConfig: config, isDirty: true })
      },

      setShowSettings: (show) => {
        set({ showSettings: show, selectedNodeId: show ? null : get().selectedNodeId })
      },

      runValidation: (nodeRegistry?: NodeRegistry) => {
        const { metadata, nodes, edges, workflowEnvVars, kind } = get()
        const settings = { workflowEnvVars }
        const result = validateWorkflowForPublish(
          metadata,
          nodes,
          edges,
          nodeRegistry,
          settings,
          kind,
        )
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
    }),
    {
      limit: UNDO_LIMIT,
      partialize: undoableSlice,
      equality: undoableEquality,
      // See HistoryRecorder: zundo's option type understates what it passes.
      handleSet: collapseDrags as unknown as ZundoHandleSet,
    },
  ),
)

/**
 * Applies a temporal step (undo/redo) and restores the editor's own
 * invariants: a time-travelled graph is unsaved by definition, and a stale
 * validation report would point at nodes that may no longer exist.
 */
/** What a time-travel step did to the node set, for user-facing feedback. */
export interface TimeTravelSummary {
  direction: 'undo' | 'redo'
  removedNodeNames: string[]
  addedNodeNames: string[]
}

function applyTimeTravel(direction: 'undo' | 'redo', step: () => void): TimeTravelSummary | null {
  const before = useWorkflowStore.getState()
  if (before.readOnly) return null
  step()
  const after = useWorkflowStore.getState()
  const afterIds = new Set(after.nodes.map((n) => n.id))
  const beforeIds = new Set(before.nodes.map((n) => n.id))
  // A time-travelled graph is unsaved by definition, stale reports may name
  // nodes that no longer exist, and the config panel must not keep showing a
  // node the undo just removed.
  useWorkflowStore.setState({
    isDirty: true,
    validationResult: null,
    simulationResult: null,
    ...(after.selectedNodeId && !afterIds.has(after.selectedNodeId) && { selectedNodeId: null }),
  })
  return {
    direction,
    removedNodeNames: before.nodes
      .filter((n) => !afterIds.has(n.id))
      .map((n) => n.data.irNode.name),
    addedNodeNames: after.nodes.filter((n) => !beforeIds.has(n.id)).map((n) => n.data.irNode.name),
  }
}

export function undoWorkflowEdit(): TimeTravelSummary | null {
  const temporalState = useWorkflowStore.temporal.getState()
  if (temporalState.pastStates.length === 0) return null
  return applyTimeTravel('undo', () => temporalState.undo())
}

export function redoWorkflowEdit(): TimeTravelSummary | null {
  const temporalState = useWorkflowStore.temporal.getState()
  if (temporalState.futureStates.length === 0) return null
  return applyTimeTravel('redo', () => temporalState.redo())
}

/**
 * One-line description of a time-travel step worth telling the user about
 * — node additions and removals, which are easy to miss on a busy canvas.
 * Position/config changes return null (visible where they happened).
 */
export function describeTimeTravel(summary: TimeTravelSummary | null): string | null {
  if (!summary) return null
  const verb = summary.direction === 'undo' ? 'Undo' : 'Redo'
  const list = (names: string[]) =>
    names.length === 1 ? `node “${names[0]}”` : `${names.length} nodes`
  if (summary.removedNodeNames.length > 0) {
    return `${verb}: removed ${list(summary.removedNodeNames)}`
  }
  if (summary.addedNodeNames.length > 0) {
    return `${verb}: restored ${list(summary.addedNodeNames)}`
  }
  return null
}

/**
 * Hook into the temporal store (history depths, for enabling undo/redo UI).
 * Zundo's temporal store is a vanilla zustand store, so React consumers
 * need useStore rather than calling it directly.
 */
export function useTemporalStore<T>(selector: (state: TemporalState<UndoableState>) => T): T {
  return useStore(useWorkflowStore.temporal, selector)
}

/** Drops history — call when loading a different workflow into the store. */
export function clearWorkflowHistory(): void {
  useWorkflowStore.temporal.getState().clear()
}
