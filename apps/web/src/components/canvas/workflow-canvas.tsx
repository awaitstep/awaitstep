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
import { nodeTypes } from './nodes'
import { LabeledEdge } from './labeled-edge'

const edgeTypes = { smoothstep: LabeledEdge }

export function WorkflowCanvas() {
  const reactFlowInstance = useRef<ReactFlowInstance<FlowNode> | null>(null)
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect, addNode, insertNodeOnEdge, selectNode, selectedNodeId } = useWorkflowStore()
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
        insertNodeOnEdge(type, position, nearest.edge.id)
      } else {
        addNode(type, position)
      }
    },
    [addNode, insertNodeOnEdge, edges, nodes],
  )

  const onDragLeave = useCallback(() => {
    setHoveredEdgeId(null)
  }, [])

  const styledEdges = hoveredEdgeId
    ? edges.map((e) => (e.id === hoveredEdgeId ? { ...e, data: { ...e.data, hovered: true } } : e))
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
      onEdgeClick={() => validatedSelectNode(null)}
      onPaneClick={() => validatedSelectNode(null)}
      nodeTypes={nodeTypes as NodeTypes}
      edgeTypes={edgeTypes}
      fitView
      snapToGrid
      snapGrid={[20, 20]}
      defaultEdgeOptions={{
        type: 'smoothstep',
        animated: true,
        style: { stroke: 'oklch(0.5 0 0)', strokeWidth: 1.5 },
      }}
      proOptions={{ hideAttribution: true }}
      className="!bg-[oklch(0.11_0_0)]"
    >
      <Background
        variant={BackgroundVariant.Dots}
        gap={20}
        size={1}
        color="oklch(0.25 0 0)"
      />
      <Controls
        showInteractive={false}
        className="!rounded-lg !border !border-white/[0.08] !bg-[oklch(0.16_0_0)] !shadow-lg [&_button]:!border-white/[0.06] [&_button]:!bg-transparent [&_button]:!text-white/50 [&_button:hover]:!bg-white/[0.06] [&_button:hover]:!text-white/80"
      />
      <MiniMap
        className="!rounded-lg !border !border-white/[0.08] !bg-[oklch(0.14_0_0)]"
        nodeColor="oklch(0.4 0 0)"
        maskColor="oklch(0.11 0 0 / 80%)"
        pannable
        zoomable
      />
    </ReactFlow>
  )
}
