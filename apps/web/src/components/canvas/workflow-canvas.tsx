import { useCallback, useRef, useState } from 'react'
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

const edgeTypes = { smoothstep: LabeledEdge }

export function WorkflowCanvas() {
  const reactFlowInstance = useRef<ReactFlowInstance<FlowNode> | null>(null)
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect, addNode, insertNodeOnEdge, selectNode, selectEdge, selectedNodeId, selectedEdgeId } = useWorkflowStore()
  const registry = useNodeRegistry()
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null)

  const validatedSelectNode = useCallback((nodeId: string | null) => {
    if (selectedNodeId && nodeId !== selectedNodeId) {
      const currentNode = nodes.find((n) => n.id === selectedNodeId)
      if (currentNode) {
        const errors = validateNode(currentNode.data.irNode)
        if (errors.length > 0) {
          toast.error(errors[0])
          return
        }
      }
    }
    selectNode(nodeId)
  }, [selectedNodeId, nodes, selectNode])

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'

    if (!reactFlowInstance.current) return
    const position = reactFlowInstance.current.screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    })
    const result = findNearestEdge(position, edges, nodes)
    setHoveredEdgeId(result?.edge.id ?? null)
  }, [edges, nodes])

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

  const styledEdges = (hoveredEdgeId || selectedEdgeId)
    ? edges.map((e) => {
        const hovered = e.id === hoveredEdgeId
        const selected = e.id === selectedEdgeId
        return (hovered || selected) ? { ...e, data: { ...e.data, hovered, selected } } : e
      })
    : edges

  return (
    <ReactFlow
      nodes={nodes}
      edges={styledEdges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
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
        animated: true,
        style: { stroke: 'var(--muted-foreground)', strokeWidth: 1.5 },
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
