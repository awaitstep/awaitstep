import { useCallback, useEffect, useRef, useState, useMemo } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  useNodesInitialized,
  useReactFlow,
  type ReactFlowInstance,
  type NodeTypes,
  type Connection,
  type Edge,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { actionToast } from '../../lib/action-toast'
import { isTypingTarget } from '../../lib/typing-target'
import {
  copyOnCanvas,
  createPasteGate,
  isCanvasEvent,
  pasteOnCanvas,
  type CanvasClipboard,
} from '../../lib/canvas/clipboard-events'
import type { NodeType } from '@awaitstep/ir'
import { useWorkflowStore, type FlowNode } from '../../stores/workflow-store'
import { redoWithFeedback, undoWithFeedback } from './time-travel'
import { canLeaveSelectedNode } from './leave-guard'
import { findNearestEdge } from '../../lib/edge-proximity'
import { withEdgeSides } from '../../lib/canvas/node-sides'
import {
  arrowMarker,
  EDGE_COLOR,
  edgeColor,
  flowingEdgeIds,
  runningNodeIds,
} from '../../lib/canvas/edge-flow'
import { useRunOverlayStore } from '../../stores/run-overlay-store'
import { useShallow } from 'zustand/react/shallow'
import { connectionFits } from '../../lib/canvas/connection-rules'
import { CANVAS_GRID } from '../../lib/canvas/place-beside'
import { reuseUnchanged } from '../../lib/canvas/stable-edges'
import { useNodeRegistry } from '../../contexts/node-registry-context'
import { nodeTypes } from './nodes'
import { LabeledEdge } from './labeled-edge'
import { buildContainerEdgeColors } from '../../lib/container-edge-colors'
import { CanvasContextMenu, type ContextMenuAction } from './canvas-context-menu'
import { CanvasLanguageService } from './canvas-language-service'
import { LastRunOverlay } from './last-run-overlay'
import { useWorkflowTypeContext } from '../../lib/monaco/use-workflow-type-context'

const edgeTypes = { smoothstep: LabeledEdge }

// Fitting a small workflow never zooms past 100%, so nodes open at their own
// size instead of blown up to fill the screen.
const FIT_VIEW_OPTIONS = { maxZoom: 1 }

// The grid the + places new nodes on, so dragged and added nodes line up.
const SNAP_GRID: [number, number] = [CANVAS_GRID, CANVAS_GRID]

interface WorkflowCanvasProps {
  /** Opens centred on this node instead of fitting the whole graph. Unknown ids are ignored. */
  focusNodeId?: string
  /** The saved workflow on show, null while it is new: its project files back the step editors' imports. */
  workflowId: string | null
  /** The `?version=` on show, so those are that version's files. */
  versionParam?: string
}

function announcePaste(newIds: string[]) {
  if (newIds.length === 0) return
  actionToast.success(newIds.length === 1 ? 'Node pasted' : `${newIds.length} nodes pasted`)
}

export function WorkflowCanvas({ focusNodeId, workflowId, versionParam }: WorkflowCanvasProps) {
  // Keep Monaco's per-workflow ambient types (Env, node outputs) in sync
  // with the canvas for every editor pane on this page.
  useWorkflowTypeContext()
  const reactFlowInstance = useRef<ReactFlowInstance<FlowNode> | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  // One paste per ⌘V: its paste event, or without one the clipboard API.
  const pasteGate = useRef(createPasteGate())
  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    addNode,
    insertNodeOnEdge,
    selectNode,
    selectEdge,
    selectedEdgeId,
    selectedNodeId,
    duplicateNodes,
    copyNodesText,
    copyNodesToClipboard,
    pasteNodesFromText,
    pasteNodesFromClipboard,
    removeNode,
    readOnly,
  } = useWorkflowStore()
  const { registry } = useNodeRegistry()
  const focusedNodeExists = focusNodeId !== undefined && nodes.some((n) => n.id === focusNodeId)
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null)
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
  const runOverlay = useRunOverlayStore(
    useShallow((s) => ({ active: s.active, nodeStatuses: s.nodeStatuses })),
  )
  const running = useMemo(
    () => runningNodeIds(runOverlay.active, runOverlay.nodeStatuses),
    [runOverlay.active, runOverlay.nodeStatuses],
  )
  const [contextMenu, setContextMenu] = useState<
    | { type: 'node'; x: number; y: number; nodeId: string }
    | { type: 'pane'; x: number; y: number; flowPosition: { x: number; y: number } }
    | null
  >(null)

  const validatedSelectNode = useCallback(
    (nodeId: string | null) => {
      if (canLeaveSelectedNode(nodeId)) selectNode(nodeId)
    },
    [selectNode],
  )

  const onDragOver = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()
      event.dataTransfer.dropEffect = 'move'

      if (!reactFlowInstance.current) return
      const position = reactFlowInstance.current.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      })
      const result = findNearestEdge(position, edges, nodes)
      setHoveredEdgeId(result?.edge.id ?? null)
    },
    [edges, nodes],
  )

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()
      setHoveredEdgeId(null)
      const type = event.dataTransfer.getData('application/awaitstep-node-type') as NodeType
      if (!type || !reactFlowInstance.current) return
      const position = reactFlowInstance.current.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      })

      const nearest = findNearestEdge(position, edges, nodes)
      if (nearest) {
        insertNodeOnEdge(type, position, nearest.edge.id, registry)
      } else {
        addNode(type, position, registry)
      }
    },
    [addNode, insertNodeOnEdge, edges, nodes, registry],
  )

  const onDragLeave = useCallback(() => {
    setHoveredEdgeId(null)
  }, [])

  // A drag the store would turn away shows as refused while it is dragged.
  const isValidConnection = useCallback((connection: Connection | Edge) => {
    const { nodes: current, edges: currentEdges } = useWorkflowStore.getState()
    return connectionFits(current, currentEdges, connection)
  }, [])

  const getActiveSelection = useCallback(() => {
    const current = useWorkflowStore
      .getState()
      .nodes.filter((n) => n.selected)
      .map((n) => n.id)
    if (current.length > 0) return current
    const single = useWorkflowStore.getState().selectedNodeId
    return single ? [single] : []
  }, [])

  const onNodeContextMenu = useCallback((event: React.MouseEvent, node: FlowNode) => {
    event.preventDefault()
    setContextMenu({ type: 'node', x: event.clientX, y: event.clientY, nodeId: node.id })
  }, [])

  const onPaneContextMenu = useCallback((event: React.MouseEvent | MouseEvent) => {
    event.preventDefault()
    if (!reactFlowInstance.current) return
    const flowPosition = reactFlowInstance.current.screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    })
    setContextMenu({ type: 'pane', x: event.clientX, y: event.clientY, flowPosition })
  }, [])

  const handleContextMenuAction = useCallback(
    (action: ContextMenuAction) => {
      if (!contextMenu) return
      if (contextMenu.type === 'node') {
        const selected = useWorkflowStore
          .getState()
          .nodes.filter((n) => n.selected)
          .map((n) => n.id)
        const ids = selected.includes(contextMenu.nodeId) ? selected : [contextMenu.nodeId]
        if (action === 'duplicate') {
          if (!readOnly) {
            const newIds = duplicateNodes(ids)
            if (newIds.length > 1) actionToast.success(`Duplicated ${newIds.length} nodes`)
          }
        } else if (action === 'copy') {
          void copyNodesToClipboard(ids).then((ok) => {
            if (ok)
              actionToast.success(ids.length === 1 ? 'Node copied' : `${ids.length} nodes copied`)
          })
        } else if (action === 'delete') {
          if (!readOnly) {
            ids.forEach((id) => removeNode(id))
          }
        }
      } else if (action === 'paste') {
        if (!readOnly) {
          void pasteNodesFromClipboard(contextMenu.flowPosition).then(announcePaste)
        }
      }
      setContextMenu(null)
    },
    [
      contextMenu,
      duplicateNodes,
      copyNodesToClipboard,
      pasteNodesFromClipboard,
      removeNode,
      readOnly,
    ],
  )

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return
      if (isTypingTarget(e.target)) return
      // Keys in a dialog above the canvas (⌘Z, ⌘V on one of its buttons) are not the canvas's.
      if ((e.target as HTMLElement | null)?.closest?.('[role="dialog"]')) return
      const key = e.key.toLowerCase()
      if (key === 'z') {
        e.preventDefault()
        // ⇧⌘Z redoes; ⌘Y is the Windows-style alias handled below.
        if (e.shiftKey) redoWithFeedback()
        else undoWithFeedback()
      } else if (key === 'y') {
        e.preventDefault()
        redoWithFeedback()
      } else if (key === 'd') {
        const ids = getActiveSelection()
        if (ids.length === 0) return
        e.preventDefault()
        if (readOnly) return
        const newIds = duplicateNodes(ids)
        if (newIds.length > 1) {
          actionToast.success(`Duplicated ${newIds.length} nodes`)
        }
      } else if (key === 'v' && !readOnly) {
        // ⌘C and ⌘V go through the browser's own copy and paste below, which
        // need no clipboard permission. A browser that fires no paste event
        // here (nothing editable focused) pastes through the clipboard API.
        // Pasted beside the copied nodes; the menu's Paste lands where it was opened.
        pasteGate.current.keyPressed()
        setTimeout(() => {
          if (!pasteGate.current.takeFallback()) return
          void pasteNodesFromClipboard().then(announcePaste)
        }, 0)
      }
    }

    let copied = 0
    const canvas: CanvasClipboard = {
      copySelection: () => {
        const ids = getActiveSelection()
        copied = ids.length
        return copyNodesText(ids)
      },
      paste: (text) => pasteNodesFromText(text),
      readOnly,
    }

    function handleCopy(e: ClipboardEvent) {
      if (!copyOnCanvas(e, canvas, window.getSelection()?.toString() ?? '')) return
      actionToast.success(copied === 1 ? 'Node copied' : `${copied} nodes copied`)
    }

    function handlePaste(e: ClipboardEvent) {
      if (!pasteGate.current.takeEvent()) {
        // The ⌘V already pasted through the clipboard API: keep the browser's own paste out too.
        if (isCanvasEvent(e)) e.preventDefault()
        return
      }
      announcePaste(pasteOnCanvas(e, canvas))
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('copy', handleCopy)
    window.addEventListener('paste', handlePaste)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('copy', handleCopy)
      window.removeEventListener('paste', handlePaste)
    }
  }, [
    duplicateNodes,
    copyNodesText,
    pasteNodesFromText,
    pasteNodesFromClipboard,
    readOnly,
    getActiveSelection,
  ])

  // Container edge colors only depend on graph topology (node types + edge connections).
  // Position drags change node references but not edge references — use edges array
  // identity as the primary cache key to avoid any work on drag frames.
  const prevEdgesRef = useRef<typeof edges | null>(null)
  const prevColorsRef = useRef<Map<string, string>>(new Map())

  const containerEdgeColors = useMemo(() => {
    // Edges array reference only changes on add/remove/label change — not position drags.
    // If edges haven't changed, skip entirely (zero work on drag frames).
    if (prevEdgesRef.current === edges) return prevColorsRef.current

    const colors = buildContainerEdgeColors(nodes, edges)
    prevEdgesRef.current = edges
    prevColorsRef.current = colors
    return colors
  }, [nodes, edges])

  // Each edge joins the sides a person dragged it between, or else the ones
  // its two nodes' positions call for (board 31b), worked out on every
  // render so an unpinned edge follows a drag live.
  const prevStyledRef = useRef<typeof edges>([])
  // Each link points at its target, and the links around the node in focus
  // (or into a running step) show dashes moving the way the run goes.
  const styledEdges = useMemo(() => {
    // No mouseleave fires for a node deleted under the pointer, so a hovered
    // id counts only while its node is there (an undo brings the id back).
    const hovered =
      hoveredNodeId && nodes.some((n) => n.id === hoveredNodeId) ? hoveredNodeId : null
    const flowing = flowingEdgeIds(edges, [selectedNodeId, hovered], running)
    const next = withEdgeSides(nodes, edges).map((e) => {
      const hovered = e.id === hoveredEdgeId
      const selected = e.id === selectedEdgeId
      const containerColor = containerEdgeColors.get(e.id)
      const markerEnd = arrowMarker(edgeColor({ highlighted: hovered || selected, containerColor }))
      const animated = flowing.has(e.id)
      if (!hovered && !selected && !containerColor) return { ...e, markerEnd, animated }
      return {
        ...e,
        markerEnd,
        animated,
        data: {
          ...e.data,
          ...(hovered && { hovered: true }),
          ...(selected && { selected: true }),
          ...(containerColor && { containerColor }),
        },
      }
    })
    const stable = reuseUnchanged(prevStyledRef.current, next)
    prevStyledRef.current = stable
    return stable
  }, [
    nodes,
    edges,
    hoveredEdgeId,
    selectedEdgeId,
    selectedNodeId,
    hoveredNodeId,
    running,
    containerEdgeColors,
  ])

  const handleNodeMouseEnter = useCallback((_event: React.MouseEvent, node: { id: string }) => {
    setHoveredNodeId(node.id)
  }, [])
  const handleNodeMouseLeave = useCallback(() => setHoveredNodeId(null), [])

  return (
    <div ref={containerRef} className="h-full w-full">
      {workflowId !== null && (
        <CanvasLanguageService
          workflowId={workflowId}
          versionParam={versionParam}
          editable={!readOnly}
        />
      )}
      <ReactFlow
        nodes={nodes}
        edges={styledEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        nodesDraggable={!readOnly}
        nodesConnectable={!readOnly}
        // A click on a handle opens its + selector rather than starting a connection.
        connectOnClick={false}
        onInit={(instance) => {
          reactFlowInstance.current = instance
        }}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onDragLeave={onDragLeave}
        onNodeClick={(_event, node) => validatedSelectNode(node.id)}
        onEdgeClick={(_event, edge) => selectEdge(edge.id)}
        onPaneClick={() => validatedSelectNode(null)}
        onNodeContextMenu={onNodeContextMenu}
        onNodeMouseEnter={handleNodeMouseEnter}
        onNodeMouseLeave={handleNodeMouseLeave}
        onPaneContextMenu={onPaneContextMenu}
        nodeTypes={nodeTypes as NodeTypes}
        edgeTypes={edgeTypes}
        fitView={!focusedNodeExists}
        fitViewOptions={FIT_VIEW_OPTIONS}
        snapToGrid
        snapGrid={SNAP_GRID}
        defaultEdgeOptions={{
          type: 'smoothstep',
          style: { stroke: EDGE_COLOR, strokeWidth: 1.25 },
        }}
        proOptions={{ hideAttribution: true }}
        className="!bg-background"
      >
        {focusNodeId !== undefined && focusedNodeExists && <CenterOnNode nodeId={focusNodeId} />}
        {workflowId !== null && <LastRunOverlay workflowId={workflowId} />}
        <Background
          variant={BackgroundVariant.Dots}
          gap={CANVAS_GRID}
          size={1}
          color="var(--muted-foreground)"
          style={{ opacity: 0.3 }}
        />
        <Controls
          showInteractive={false}
          className="!rounded-lg !border !border-border !bg-card !shadow-lg [&_button]:!border-border [&_button]:!bg-transparent [&_button]:!text-muted-foreground [&_button:hover]:!bg-muted/60 [&_button:hover]:!text-foreground/80"
        />
        <MiniMap
          className="!rounded-lg !border !border-border !bg-card"
          nodeColor="var(--muted-foreground)"
          maskColor="var(--background)"
          pannable
          zoomable
        />
      </ReactFlow>
      {contextMenu && (
        <CanvasContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          type={contextMenu.type}
          onAction={handleContextMenuAction}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  )
}

/** Centres the view on one node once, as soon as the graph has been measured. */
function CenterOnNode({ nodeId }: { nodeId: string }) {
  const initialized = useNodesInitialized()
  const { fitView } = useReactFlow()
  const centred = useRef<string | null>(null)

  useEffect(() => {
    if (!initialized || centred.current === nodeId) return
    centred.current = nodeId
    void fitView({ nodes: [{ id: nodeId }], maxZoom: 1, padding: 0.6, duration: 0 })
  }, [initialized, nodeId, fitView])

  return null
}
