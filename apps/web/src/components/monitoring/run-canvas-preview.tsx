import { useMemo } from 'react'
import { ReactFlow, Background, BackgroundVariant, type NodeTypes } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { WorkflowNode, Edge as IREdge } from '@awaitstep/ir'
import { nodeTypes } from '../canvas/nodes'
import { LabeledEdge } from '../canvas/labeled-edge'
import type { FlowNode } from '../../stores/workflow-store'

const edgeTypes = { smoothstep: LabeledEdge }

interface RunCanvasPreviewProps {
  ir: string
}

export function RunCanvasPreview({ ir }: RunCanvasPreviewProps) {
  const { nodes, edges } = useMemo(() => {
    try {
      const parsed = JSON.parse(ir) as { nodes: WorkflowNode[]; edges: IREdge[] }

      const flowNodes: FlowNode[] = parsed.nodes.map((n) => ({
        id: n.id,
        type: n.type,
        position: n.position,
        data: { irNode: n },
      }))

      const flowEdges = parsed.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        type: 'smoothstep' as const,
        animated: false,
        label: e.label,
        style: { stroke: 'oklch(0.5 0 0)', strokeWidth: 1.5 },
      }))

      return { nodes: flowNodes, edges: flowEdges }
    } catch {
      return { nodes: [], edges: [] }
    }
  }, [ir])

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes as NodeTypes}
      edgeTypes={edgeTypes}
      fitView
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      panOnDrag
      zoomOnScroll
      proOptions={{ hideAttribution: true }}
      className="!bg-[oklch(0.11_0_0)]"
    >
      <Background
        variant={BackgroundVariant.Dots}
        gap={20}
        size={1}
        color="oklch(0.25 0 0)"
      />
    </ReactFlow>
  )
}
