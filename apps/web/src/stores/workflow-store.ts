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
import { withoutWaitArmTo } from '@awaitstep/ir'
import type { ResourceDeclaration, WorkflowNode, NodeType, WorkflowMetadata } from '@awaitstep/ir'
import { validateWorkflowForPublish, type PublishValidationResult } from '../lib/validate-workflow'
import { fallbackPosition } from '../lib/hydrate-workflow'
import type { NodeRegistry } from '@awaitstep/ir'
import { simulateWorkflow, type SimulationResult } from '../lib/simulate-workflow'
import { customAlphabet } from 'nanoid'
import {
  computeVarNames,
  followStepFunctionNames,
  followWaitArm,
  stepModuleTemplate,
} from '@awaitstep/codegen'
import { buildIRFromState } from '../lib/build-ir'
import { configDefaults } from '../lib/node-defaults'
import { stepCodeForInline } from '../lib/step-inline'
import { exitConnection } from '../lib/canvas/connection-rules'
import {
  NODE_HEIGHT,
  NODE_WIDTH,
  nodeBox,
  pinnedHandles,
  pinnedSides,
  retargetEdge,
  type EntrySide,
  type ExitSide,
  type NodeSide,
} from '../lib/canvas/node-sides'
import { placeBeside } from '../lib/canvas/place-beside'
import { copyToClipboard } from '../lib/utils'

const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789_', 12)

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

/** The nodes copied last in this tab, for a paste that may not read the system clipboard. */
let lastCopiedNodes: string | null = null

interface ClipboardEdge {
  source: string
  target: string
  label?: string
  sourceSide?: ExitSide
  targetSide?: EntrySide
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
      ...pinnedSides(e),
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
      ...pinnedHandles(e),
    }))
  return { nodes: newNodes, edges: newEdges }
}

export interface WorkflowNodeData extends Record<string, unknown> {
  irNode: WorkflowNode
}

export type FlowNode = Node<WorkflowNodeData>

/**
 * `next` with each step's function renamed to follow its variable name once
 * the node set or a name changed — a removal, a rename, a duplicate or a
 * paste moves other steps' `_2` suffixes, and a clone exports its source's
 * name. The same array when nothing changes.
 */
function withFollowedFunctionNames(previous: FlowNode[], next: FlowNode[]): FlowNode[] {
  const nextIr = next.map((n) => n.data.irNode)
  const renamed = followStepFunctionNames(
    previous.map((n) => n.data.irNode),
    nextIr,
  )
  if (renamed === nextIr) return next
  return next.map((n, i) =>
    renamed[i] === nextIr[i] ? n : { ...n, data: { ...n.data, irNode: renamed[i]! } },
  )
}

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
  runtimeResources: [],
  runtimeProvider: null,
  deployConfig: {},
  validationResult: null,
  simulationResult: null,
  isDirty: false,
  readOnly: false,
  graphHash: null,
})

interface WorkflowState {
  workflowId: string | null
  /**
   * The save precondition of the version the canvas shows (`WorkflowFull.graphHash`,
   * or the last save's response): what the next save names as its base. Null
   * until a version is loaded.
   */
  graphHash: string | null
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
  /** Provider-scoped resources round-tripped through ir.runtime.resources. */
  runtimeResources: ResourceDeclaration[]
  /** The runtime the canvas declares; null until a provider-specific binding is used. */
  runtimeProvider: string | null
  deployConfig: DeployConfig
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
  /**
   * Adds a node from one of `nodeId`'s sides (a + on the canvas) and joins it
   * up: from an exit, `nodeId → new`; from an entry, `new → nodeId`, with
   * every edge that came into `nodeId` arriving at the new node instead.
   * Returns the new id, or null when that side cannot take one more edge.
   */
  addNodeFromSide: (
    nodeId: string,
    side: NodeSide,
    type: NodeType,
    registry?: NodeRegistry,
  ) => string | null
  updateNodeData: (nodeId: string, data: Partial<WorkflowNode>) => void
  /** Renames a node; a step's module function follows when it still carried the old name. */
  renameNode: (nodeId: string, name: string) => void
  /** Sets one `data` field, merging into the node as it is in the store at write time. */
  updateNodeField: (nodeId: string, fieldId: string, value: unknown) => void
  removeNode: (nodeId: string) => void
  selectNode: (nodeId: string | null) => void
  selectEdge: (edgeId: string | null) => void
  duplicateNodes: (nodeIds: string[]) => string[]
  /** The nodes as clipboard text (also kept as the in-app copy); null with nothing to copy. */
  copyNodesText: (nodeIds: string[]) => string | null
  copyNodesToClipboard: (nodeIds: string[]) => Promise<boolean>
  /** Pastes clipboard text that holds copied nodes; anything else pastes nothing. */
  pasteNodesFromText: (raw: string, centerPosition?: { x: number; y: number }) => string[]
  pasteNodesFromClipboard: (centerPosition?: { x: number; y: number }) => Promise<string[]>

  setKind: (kind: 'workflow' | 'script') => void
  setMetadata: (metadata: Partial<WorkflowMetadata>) => void
  setWorkflowEnvVars: (vars: WorkflowEnvVar[]) => void
  /** Add or replace a provider-owned binding declaration. */
  upsertRuntimeResource: (resource: ResourceDeclaration) => void
  setDeployConfig: (config: DeployConfig) => void
  runValidation: (nodeRegistry?: NodeRegistry) => PublishValidationResult
  clearValidation: () => void
  runSimulation: () => SimulationResult
  clearSimulation: () => void
  loadWorkflow: (metadata: WorkflowMetadata, nodes: FlowNode[], edges: Edge[]) => void
  setWorkflowId: (id: string | null) => void
  markClean: () => void
  reset: () => void
}

/** `nodes` with the wait `sourceId`'s `label` arm field cleared if it names `target`. */
function withWaitArmCleared(
  nodes: FlowNode[],
  sourceId: string,
  target: string,
  label: string,
): FlowNode[] {
  let changed = false
  const next = nodes.map((n) => {
    if (n.id !== sourceId) return n
    const cleared = withoutWaitArmTo(n.data.irNode, target, label)
    if (cleared === n.data.irNode) return n
    changed = true
    return { ...n, data: { ...n.data, irNode: cleared } }
  })
  return changed ? next : nodes
}

function createDefaultNode(
  type: NodeType,
  position: { x: number; y: number },
  registry: NodeRegistry | undefined,
  siblings: readonly WorkflowNode[],
): WorkflowNode {
  const id = nanoid()
  const base = { id, type, position, name: `New ${type}`, version: '1.0.0' }

  switch (type) {
    case 'step': {
      // The module is named as the worker will import it: the name decoded,
      // deduplicated against the nodes already there.
      const varName = computeVarNames([...siblings, base]).get(id)!
      return { ...base, data: { code: stepModuleTemplate(varName) } }
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
      return {
        ...base,
        data: {
          eventType: 'my-event',
          timeout: '365 days',
          onEventNode: '',
          onTimeoutNode: '',
        },
      }
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
          params: {},
        },
      }
    case 'sub_script':
      return {
        ...base,
        name: 'Call Script',
        data: {
          scriptId: '',
          method: 'POST',
          url: 'https://invoke/',
          headers: {},
          body: '',
          retryLimit: 2,
          params: {},
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
  | 'dependencies'
  | 'triggerCode'
  | 'runtimeResources'
  | 'runtimeProvider'
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

function withoutHandles(edge: Edge): Edge {
  const { sourceHandle: _sourceHandle, targetHandle: _targetHandle, ...rest } = edge
  return rest
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
    dependencies: state.dependencies,
    triggerCode: state.triggerCode,
    runtimeResources: state.runtimeResources,
    runtimeProvider: state.runtimeProvider,
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
    past.dependencies === current.dependencies &&
    past.triggerCode === current.triggerCode &&
    past.runtimeResources === current.runtimeResources &&
    past.runtimeProvider === current.runtimeProvider
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
        const applied = applyNodeChanges(changes, get().nodes)
        set({
          nodes: removedIds.size > 0 ? withFollowedFunctionNames(get().nodes, applied) : applied,
          ...(hasDirtyChange && { isDirty: true }),
          ...(selectedNodeId === null && { selectedNodeId: null }),
        })
      },

      onEdgesChange: (changes) => {
        if (get().readOnly) return
        if (changes.length === 0) return
        const dirtyTypes = new Set(['add', 'remove', 'replace'])
        const hasDirtyChange = changes.some((c) => dirtyTypes.has(c.type))
        // A wait also names each arm's node in a field the code follows: a
        // deleted arm connection takes that field with it.
        const removed = new Set(changes.filter((c) => c.type === 'remove').map((c) => c.id))
        let nodes = get().nodes
        for (const edge of get().edges) {
          if (!removed.has(edge.id)) continue
          const label = typeof edge.label === 'string' ? edge.label : undefined
          if (label === undefined) continue
          nodes = withWaitArmCleared(nodes, edge.source, edge.target, label)
        }
        set({
          edges: applyEdgeChanges(changes, get().edges),
          ...(nodes !== get().nodes && { nodes }),
          ...(hasDirtyChange && { isDirty: true }),
        })
      },

      onConnect: (connection) => {
        if (get().readOnly) return
        const { nodes, edges } = get()
        // A dragged edge keeps the sides it was dragged between (saved as
        // the IR edge's sourceSide / targetSide); stray handle ids are dropped.
        const sides = pinnedSides(connection)
        const ends = {
          source: connection.source,
          target: connection.target,
          ...pinnedHandles(sides),
        }
        // Dragging again between two joined nodes moves the edge to the new
        // sides; it never adds a second edge.
        const existing = edges.find(
          (e) => e.source === connection.source && e.target === connection.target,
        )
        if (existing) {
          const same =
            (existing.sourceHandle ?? undefined) === ends.sourceHandle &&
            (existing.targetHandle ?? undefined) === ends.targetHandle
          if (same) return
          set({
            edges: edges.map((e) => (e === existing ? { ...withoutHandles(e), ...ends } : e)),
            isDirty: true,
          })
          return
        }
        const sourceNode = nodes.find((n) => n.id === connection.source)
        if (!sourceNode) {
          set({ edges: addEdge({ ...ends, id: nanoid() }, edges), isDirty: true })
          return
        }
        const outgoing = edges.filter((e) => e.source === connection.source)
        const exit = exitConnection(sourceNode.data.irNode, outgoing)
        if (!exit.allowed) return

        const newEdge = { ...ends, id: nanoid(), ...(exit.label ? { label: exit.label } : {}) }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- addEdge's internal type is stricter than Edge[]
        set({ edges: addEdge(newEdge, edges as any) as Edge[], isDirty: true })
      },

      addNodeFromSide: (nodeId, side, type, registry) => {
        if (get().readOnly) return null
        const { nodes, edges } = get()
        const anchor = nodes.find((n) => n.id === nodeId)
        if (!anchor) return null
        const isExit = side === 'bottom' || side === 'right'
        const outgoing = edges.filter((e) => e.source === nodeId)
        const exit = isExit ? exitConnection(anchor.data.irNode, outgoing) : null
        if (exit && !exit.allowed) return null

        const position = placeBeside(
          nodeBox(anchor),
          side,
          { width: NODE_WIDTH, height: NODE_HEIGHT },
          nodes.filter((n) => n.id !== nodeId).map(nodeBox),
        )
        const irNode = createDefaultNode(
          type,
          position,
          registry,
          nodes.map((n) => n.data.irNode),
        )
        const flowNode: FlowNode = {
          id: irNode.id,
          type: toFlowType(irNode.type),
          position,
          data: { irNode },
          selected: true,
        }
        const deselected = nodes.map((n) => (n.selected ? { ...n, selected: false } : n))

        // An entry + goes right before the node: every way in now arrives at
        // the new node instead, keeping its label, and the new node leads on.
        const incoming = isExit ? [] : edges.filter((e) => e.target === nodeId)
        let nextNodes = [...deselected, flowNode]
        let nextEdges: Edge[]
        if (exit) {
          nextEdges = [
            ...edges,
            {
              id: nanoid(),
              source: nodeId,
              target: irNode.id,
              ...(exit.label ? { label: exit.label } : {}),
            },
          ]
        } else {
          nextEdges = [
            // The side it entered by belonged to the old node; the new one's is
            // worked out from where it sits.
            ...edges.map((e) => (e.target === nodeId ? retargetEdge(e, irNode.id) : e)),
            { id: nanoid(), source: irNode.id, target: nodeId },
          ]
          // A wait names its arm's first node: on those arms, that is now the new node.
          for (const edge of incoming) {
            const label = typeof edge.label === 'string' ? edge.label : undefined
            nextNodes = nextNodes.map((n) => {
              if (n.id !== edge.source) return n
              const moved = followWaitArm(n.data.irNode, label, nodeId, irNode.id)
              return moved === n.data.irNode ? n : { ...n, data: { ...n.data, irNode: moved } }
            })
          }
        }

        set({
          nodes: nextNodes,
          edges: nextEdges,
          selectedNodeId: irNode.id,
          selectedEdgeId: null,
          isDirty: true,
        })
        return irNode.id
      },

      addNode: (type, position, registry) => {
        if (get().readOnly) return
        const irNode = createDefaultNode(
          type,
          position,
          registry,
          get().nodes.map((n) => n.data.irNode),
        )
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

        const irNode = createDefaultNode(
          type,
          position,
          registry,
          get().nodes.map((n) => n.data.irNode),
        )
        const flowNode: FlowNode = {
          id: irNode.id,
          type: toFlowType(irNode.type),
          position,
          data: { irNode },
        }

        const newEdges = edges.filter((e) => e.id !== edgeId)
        newEdges.push(
          // Each half keeps the end of the old edge it still has: the exit
          // side it left by, the entry side it arrived by.
          {
            id: nanoid(),
            source: edge.source,
            target: irNode.id,
            label: edge.label,
            ...(edge.sourceHandle != null && { sourceHandle: edge.sourceHandle }),
          },
          {
            id: nanoid(),
            source: irNode.id,
            target: edge.target,
            ...(edge.targetHandle != null && { targetHandle: edge.targetHandle }),
          },
        )
        // A wait also names its arm's first node in a field the generated code
        // reads first: it moves to the new node, or the new node is skipped.
        const label = typeof edge.label === 'string' ? edge.label : undefined
        const withArm = nodes.map((n) => {
          if (n.id !== edge.source) return n
          const moved = followWaitArm(n.data.irNode, label, edge.target, irNode.id)
          return moved === n.data.irNode ? n : { ...n, data: { ...n.data, irNode: moved } }
        })

        set({ nodes: [...withArm, flowNode], edges: newEdges, isDirty: true })
      },

      updateNodeData: (nodeId, data) => {
        if (get().readOnly) return
        const currentNode = get().nodes.find((n) => n.id === nodeId)
        // A write for a node that is gone (deleted, or replaced by a reload)
        // changes nothing, so it must not mark the draft dirty either.
        if (!currentNode) return
        const updatedIrNode = { ...currentNode.data.irNode, ...data } as WorkflowNode

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
          // Only a rename keeps positions: when a condition is added or
          // removed, an index names a different branch, and the panel writes
          // the connections it changes itself.
          if (oldBranches.length === newBranches.length)
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
                irNode: updatedIrNode,
              },
            }
          }),
          edges,
          isDirty: true,
        })
      },

      renameNode: (nodeId, name) => {
        if (get().readOnly) return
        const nodes = get().nodes
        if (!nodes.some((n) => n.id === nodeId)) return
        // The renamed step's function follows its new variable name, and so
        // does any other step's whose `_2` suffix the rename moved.
        const renamed = nodes.map((n) =>
          n.id === nodeId ? { ...n, data: { ...n.data, irNode: { ...n.data.irNode, name } } } : n,
        )
        set({ nodes: withFollowedFunctionNames(nodes, renamed), isDirty: true })
      },

      updateNodeField: (nodeId, fieldId, value) => {
        const currentNode = get().nodes.find((n) => n.id === nodeId)
        if (!currentNode) return
        // `undefined` clears the field, so a cleared input leaves no key behind.
        const { [fieldId]: _previous, ...rest } = currentNode.data.irNode.data
        let data = value === undefined ? rest : { ...rest, [fieldId]: value }
        // The Inline switch changes what shape the code must have: the step's
        // code is converted with it, so the switch never leaves the step
        // refusing to close.
        if (fieldId === 'inline' && currentNode.data.irNode.type === 'step') {
          const state = get()
          const nodes = state.nodes.map((n) =>
            n.id === nodeId ? { ...n, data: { ...n.data, irNode: { ...n.data.irNode, data } } } : n,
          )
          const code = stepCodeForInline(
            buildIRFromState({ ...state, nodes }),
            nodeId,
            value === true,
          )
          data = { ...data, code }
        }
        get().updateNodeData(nodeId, { data })
      },

      removeNode: (nodeId) => {
        if (get().readOnly) return
        // A wait whose arm field named the removed node no longer runs it.
        const remaining = get()
          .nodes.filter((n) => n.id !== nodeId)
          .map((n) => {
            const cleared = withoutWaitArmTo(n.data.irNode, nodeId)
            return cleared === n.data.irNode ? n : { ...n, data: { ...n.data, irNode: cleared } }
          })
        set({
          nodes: withFollowedFunctionNames(get().nodes, remaining),
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
          nodes: withFollowedFunctionNames(nodes, [
            ...nodes.map((n) => (n.selected ? { ...n, selected: false } : n)),
            ...cloned.nodes.map((n) => ({ ...n, selected: true })),
          ]),
          edges: [...edges, ...cloned.edges],
          selectedNodeId: newIds[0] ?? null,
          selectedEdgeId: null,
          isDirty: true,
        })
        return newIds
      },

      copyNodesText: (nodeIds) => {
        if (nodeIds.length === 0) return null
        const { nodes, edges } = get()
        const payload = buildClipboardPayload(nodes, edges, nodeIds)
        if (!payload) return null
        const text = JSON.stringify(payload)
        lastCopiedNodes = text
        return text
      },

      copyNodesToClipboard: async (nodeIds) => {
        const text = get().copyNodesText(nodeIds)
        if (!text) return false
        // Kept here too: Paste from the menu falls back on it where the page
        // may not read the system clipboard (plain http, a refused permission).
        try {
          await copyToClipboard(text)
        } catch {
          // The in-app copy still pastes.
        }
        return true
      },

      pasteNodesFromText: (raw, centerPosition) => {
        if (get().readOnly || !raw) return []
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
          nodes: withFollowedFunctionNames(nodes, [
            ...nodes.map((n) => (n.selected ? { ...n, selected: false } : n)),
            ...cloned.nodes.map((n) => ({ ...n, selected: true })),
          ]),
          edges: [...edges, ...cloned.edges],
          selectedNodeId: newIds[0] ?? null,
          selectedEdgeId: null,
          isDirty: true,
        })
        return newIds
      },

      pasteNodesFromClipboard: async (centerPosition) => {
        if (get().readOnly) return []
        // The system clipboard when the page may read it; else what was copied here.
        let raw: string | null
        try {
          raw = await navigator.clipboard.readText()
        } catch {
          raw = lastCopiedNodes
        }
        return raw ? get().pasteNodesFromText(raw, centerPosition) : []
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

      upsertRuntimeResource: (resource) => {
        const resources = get().runtimeResources
        const index = resources.findIndex(
          (existing) => existing.name === resource.name && existing.kind === resource.kind,
        )
        const next =
          index === -1
            ? [...resources, resource]
            : resources.map((existing, i) => (i === index ? resource : existing))
        set({
          runtimeResources: next,
          runtimeProvider: resource.provider ?? get().runtimeProvider,
          isDirty: true,
        })
      },

      setDeployConfig: (config) => {
        set({ deployConfig: config, isDirty: true })
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
        // A loaded template is an edit nobody has saved: a workflow the
        // dashboard already created has to auto-save it and warn before
        // it is lost.
        set({ metadata, nodes: fixedNodes, edges, isDirty: true })
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
