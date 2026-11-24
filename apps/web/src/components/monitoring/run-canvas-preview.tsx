import { fallbackPosition } from '../../lib/hydrate-workflow'
import { useEffect, useMemo } from 'react'
import { ReactFlow, Background, BackgroundVariant, type NodeTypes } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { WorkflowNode, Edge as IREdge } from '@awaitstep/ir'
import { nodeTypes } from '../canvas/nodes'
import { pinnedHandles, withEdgeSides } from '../../lib/canvas/node-sides'
import { flowingEdgeIds, runningNodeIds, withFlow } from '../../lib/canvas/edge-flow'
import { LabeledEdge } from '../canvas/labeled-edge'
import { toFlowType, type FlowNode } from '../../stores/workflow-store'
import { useRunOverlayStore, type StepStatus } from '../../stores/run-overlay-store'
import { NodeRegistryProvider } from '../../contexts/node-registry-context'

const edgeTypes = { smoothstep: LabeledEdge }
const RUN_EDGE_COLOR = 'oklch(0.5 0 0)'
// Fitting never zooms past 100%, as on the editor canvas.
const FIT_VIEW_OPTIONS = { maxZoom: 1 }

interface RunCanvasPreviewProps {
  /** The run's workflow: its marketplace and Library nodes draw with their own icons. */
  workflowId?: string
  ir: string
  /** Per-node run status; node chrome reads it through the overlay store. */
  nodeStatuses?: Record<string, StepStatus>
}

export function RunCanvasPreview({ workflowId, ir, nodeStatuses }: RunCanvasPreviewProps) {
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
        // Marketplace and Library nodes carry their own IR type; React Flow
        // knows them only as `custom`, and an unknown type draws an empty box.
        type: toFlowType(n.type),
        position: n.position ?? fallbackPosition(i),
        data: { irNode: n },
      }))

      const flowEdges = parsed.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        type: 'smoothstep' as const,
        label: e.label,
        ...pinnedHandles(e),
        style: { stroke: RUN_EDGE_COLOR, strokeWidth: 1.5 },
      }))

      return { nodes: flowNodes, edges: withEdgeSides(flowNodes, flowEdges) }
    } catch {
      return { nodes: [], edges: [] }
    }
  }, [ir])

  // Arrows on every link, and dashes moving into the steps that are running.
  const flowEdges = useMemo(
    () =>
      withFlow(
        edges,
        flowingEdgeIds(edges, [], runningNodeIds(true, nodeStatuses ?? {})),
        RUN_EDGE_COLOR,
      ),
    [edges, nodeStatuses],
  )

  return (
    <NodeRegistryProvider workflowId={workflowId}>
      <ReactFlow
        nodes={nodes}
        edges={flowEdges}
        nodeTypes={nodeTypes as NodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={FIT_VIEW_OPTIONS}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag
        zoomOnScroll
        proOptions={{ hideAttribution: true }}
        className="!bg-editor"
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="oklch(0.25 0 0)" />
      </ReactFlow>
    </NodeRegistryProvider>
  )
}
