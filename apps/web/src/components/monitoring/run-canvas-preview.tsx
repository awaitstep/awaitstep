import { fallbackPosition } from '../../lib/hydrate-workflow'
import { useEffect, useMemo } from 'react'
import { ReactFlow, Background, BackgroundVariant, type NodeTypes } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { WorkflowNode, Edge as IREdge } from '@awaitstep/ir'
import { nodeTypes } from '../canvas/nodes'
import { LabeledEdge } from '../canvas/labeled-edge'
import type { FlowNode } from '../../stores/workflow-store'
import { useRunOverlayStore, type StepStatus } from '../../stores/run-overlay-store'

const edgeTypes = { smoothstep: LabeledEdge }

interface RunCanvasPreviewProps {
  ir: string
  /** Per-node run status; node chrome reads it through the overlay store. */
  nodeStatuses?: Record<string, StepStatus>
}

export function RunCanvasPreview({ ir, nodeStatuses }: RunCanvasPreviewProps) {
  const setOverlay = useRunOverlayStore((s) => s.setOverlay)
  const clearOverlay = useRunOverlayStore((s) => s.clearOverlay)

  // The overlay store is global (NodeBase subscribes to it for every canvas),
  // so it is owned for exactly the lifetime of this preview.
  useEffect(() => {
    if (nodeStatuses) setOverlay(nodeStatuses)
    return () => clearOverlay()
  }, [nodeStatuses, setOverlay, clearOverlay])

  const { nodes, edges } = useMemo(() => {
    try {
      const parsed = JSON.parse(ir) as { nodes: WorkflowNode[]; edges: IREdge[] }

      const flowNodes: FlowNode[] = parsed.nodes.map((n, i) => ({
        id: n.id,
        type: n.type,
        position: n.position ?? fallbackPosition(i),
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
      <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="oklch(0.25 0 0)" />
    </ReactFlow>
  )
}
