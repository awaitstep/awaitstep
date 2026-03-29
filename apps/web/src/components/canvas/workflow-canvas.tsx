import { useCallback, useRef, useState, useMemo } from 'react'
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

const edgeTypes = { smoothstep: LabeledEdge }

export function WorkflowCanvas() {
  const reactFlowInstance = useRef<ReactFlowInstance<FlowNode> | null>(null)
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
    readOnly,
  } = useWorkflowStore()
  const { registry } = useNodeRegistry()
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null)

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
  )
}
