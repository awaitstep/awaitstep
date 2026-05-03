import { useCallback, useEffect, useRef, useState, useMemo } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  type ReactFlowInstance,
  type NodeTypes,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { toast } from 'sonner'
import type { NodeType } from '@awaitstep/ir'
import { useWorkflowStore, type FlowNode } from '../../stores/workflow-store'
import { validateNode } from './node-config-panel'
import { findNearestEdge } from '../../lib/edge-proximity'
import { useNodeRegistry } from '../../contexts/node-registry-context'
import { nodeTypes } from './nodes'
import { LabeledEdge } from './labeled-edge'
import { buildContainerEdgeColors } from '../../lib/container-edge-colors'
import { CanvasContextMenu, type ContextMenuAction } from './canvas-context-menu'

const edgeTypes = { smoothstep: LabeledEdge }

export function WorkflowCanvas() {
  const reactFlowInstance = useRef<ReactFlowInstance<FlowNode> | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
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
    selectedNodeId,
    selectedEdgeId,
    duplicateNodes,
    copyNodesToClipboard,
    pasteNodesFromClipboard,
    removeNode,
    readOnly,
  } = useWorkflowStore()
  const { registry } = useNodeRegistry()
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<
    | { type: 'node'; x: number; y: number; nodeId: string }
    | { type: 'pane'; x: number; y: number; flowPosition: { x: number; y: number } }
    | null
  >(null)

  const validatedSelectNode = useCallback(
    (nodeId: string | null) => {
      if (selectedNodeId && nodeId !== selectedNodeId) {
        const currentNode = useWorkflowStore.getState().nodes.find((n) => n.id === selectedNodeId)
        if (currentNode) {
          const errors = validateNode(currentNode.data.irNode)
          if (errors.length > 0) {
            toast.error(errors[0])
            return
          }
        }
      }
      selectNode(nodeId)
    },
    [selectedNodeId, selectNode],
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
            if (newIds.length > 1) toast.success(`Duplicated ${newIds.length} nodes`)
          }
        } else if (action === 'copy') {
          void copyNodesToClipboard(ids).then((ok) => {
            if (ok) toast.success(ids.length === 1 ? 'Node copied' : `${ids.length} nodes copied`)
          })
        } else if (action === 'delete') {
          if (!readOnly) {
            ids.forEach((id) => removeNode(id))
          }
        }
      } else if (action === 'paste') {
        if (!readOnly) {
          void pasteNodesFromClipboard(contextMenu.flowPosition).then((newIds) => {
            if (newIds.length > 0) {
              toast.success(newIds.length === 1 ? 'Node pasted' : `${newIds.length} nodes pasted`)
            }
          })
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

  const getViewportCenter = useCallback(() => {
    const instance = reactFlowInstance.current
    const el = containerRef.current
    if (!instance || !el) return undefined
    const rect = el.getBoundingClientRect()
    return instance.screenToFlowPosition({
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    })
  }, [])

  useEffect(() => {
    function isTypingTarget(target: EventTarget | null): boolean {
      const el = target as HTMLElement | null
      if (!el) return false
      const tag = el.tagName
      return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return
      if (isTypingTarget(e.target)) return
      const key = e.key.toLowerCase()
      if (key === 'd') {
        const ids = getActiveSelection()
        if (ids.length === 0) return
        e.preventDefault()
        if (readOnly) return
        const newIds = duplicateNodes(ids)
        if (newIds.length > 1) {
          toast.success(`Duplicated ${newIds.length} nodes`)
        }
      } else if (key === 'c') {
        const ids = getActiveSelection()
        if (ids.length === 0) return
        e.preventDefault()
        void copyNodesToClipboard(ids).then((ok) => {
          if (ok) toast.success(ids.length === 1 ? 'Node copied' : `${ids.length} nodes copied`)
        })
      } else if (key === 'v') {
        if (readOnly) return
        e.preventDefault()
        const center = getViewportCenter()
        void pasteNodesFromClipboard(center).then((newIds) => {
          if (newIds.length > 0) {
            toast.success(newIds.length === 1 ? 'Node pasted' : `${newIds.length} nodes pasted`)
          }
        })
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    duplicateNodes,
    copyNodesToClipboard,
    pasteNodesFromClipboard,
    readOnly,
    getActiveSelection,
    getViewportCenter,
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

  const styledEdges = useMemo(() => {
    const hasContainerColors = containerEdgeColors.size > 0
    if (!hoveredEdgeId && !selectedEdgeId && !hasContainerColors) return edges

    return edges.map((e) => {
      const hovered = e.id === hoveredEdgeId
      const selected = e.id === selectedEdgeId
      const containerColor = hasContainerColors ? containerEdgeColors.get(e.id) : undefined
      if (!hovered && !selected && !containerColor) return e
      return {
        ...e,
        data: {
          ...e.data,
          ...(hovered && { hovered: true }),
          ...(selected && { selected: true }),
          ...(containerColor && { containerColor }),
        },
      }
    })
  }, [edges, hoveredEdgeId, selectedEdgeId, containerEdgeColors])

  return (
    <div ref={containerRef} className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={styledEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodesDraggable={!readOnly}
        nodesConnectable={!readOnly}
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
        onPaneContextMenu={onPaneContextMenu}
        nodeTypes={nodeTypes as NodeTypes}
        edgeTypes={edgeTypes}
        fitView
        snapToGrid
        snapGrid={[20, 20]}
        defaultEdgeOptions={{
          type: 'smoothstep',
          style: { stroke: 'var(--muted-foreground)', strokeWidth: 0.5 },
        }}
        proOptions={{ hideAttribution: true }}
        className="!bg-background"
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
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
