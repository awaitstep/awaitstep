import { useEffect, useMemo } from 'react'
import { Link } from '@tanstack/react-router'
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  useNodesInitialized,
  useReactFlow,
  useStore,
  type NodeTypes,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Maximize2, Workflow, X } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { nodeTypes } from '../canvas/nodes'
import { LabeledEdge } from '../canvas/labeled-edge'
import { withContainerEdgeColors } from '../../lib/container-edge-colors'
import { useWorkflowStore } from '../../stores/workflow-store'
import { useIdeLayoutStore } from '../../stores/ide-layout-store'

const edgeTypes = { smoothstep: LabeledEdge }

/**
 * Padding leaves the graph breathing room against the panel edge; the zoom
 * ceiling stops a two-node workflow from filling the panel with one giant
 * card.
 */
const FIT_VIEW_OPTIONS = { padding: 0.18, maxZoom: 1, minZoom: 0.15 } as const

interface CanvasPreviewProps {
  workflowId: string
  /** Carried across so the canvas opens the same version being read here. */
  versionParam?: string
}

/**
 * The workflow's graph, read-only, in a drawer over the right of the editor.
 *
 * Code mode is a dev workspace, not a consolation prize for people who can
 * use the canvas: someone editing a step still needs to see where that step
 * sits. What it shows is the saved version's graph — the same thing the open
 * files were generated from — so it stays in step with the code on screen.
 *
 * It overlays rather than claiming a column because the editor's width is
 * the thing a dev is least willing to give up, and glancing at the graph is
 * a moment's work, not a mode. 30% leaves the editor the bulk of the window
 * while staying wide enough to read a real graph; the floor keeps it usable
 * on a narrow window, where 30% would be a thumbnail.
 *
 * Nothing here edits the graph. Editing it is what the canvas is for, which
 * is why the way over is labelled for that rather than for the navigation:
 * "Edit on canvas" says what the canvas adds, where "Open canvas" only said
 * where it goes.
 */
export function CanvasPreview({ workflowId, versionParam }: CanvasPreviewProps) {
  const { nodes, edges } = useWorkflowStore(useShallow((s) => ({ nodes: s.nodes, edges: s.edges })))
  const togglePreview = useIdeLayoutStore((s) => s.togglePreview)
  const styledEdges = useMemo(() => withContainerEdgeColors(nodes, edges), [nodes, edges])

  return (
    <>
      {/* The drawer's frame — position, width, border — belongs to the
          workspace layout, so this fills whatever it is given. */}
      <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-border px-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <Workflow className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
          <span className="text-[11px] font-medium uppercase tracking-wider text-foreground">
            Canvas preview
          </span>
          {nodes.length > 0 && (
            <span className="rounded-full bg-muted/60 px-1.5 py-px text-[10px] tabular-nums text-muted-foreground">
              {nodes.length}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <Link
            to="/workflows/$workflowId/canvas"
            params={{ workflowId }}
            search={versionParam ? { version: versionParam } : {}}
            title="Open the full canvas, where the graph can be edited"
            className="inline-flex h-6 items-center gap-1.5 rounded px-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
          >
            <Maximize2 className="h-3 w-3" />
            Edit on canvas
          </Link>
          <button
            type="button"
            onClick={togglePreview}
            title="Hide canvas preview"
            aria-label="Hide canvas preview"
            className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground/60 transition-colors hover:bg-muted/60 hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1">
        {nodes.length === 0 ? (
          <PreviewEmptyState />
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={styledEdges}
            nodeTypes={nodeTypes as NodeTypes}
            edgeTypes={edgeTypes}
            fitView
            fitViewOptions={FIT_VIEW_OPTIONS}
            minZoom={FIT_VIEW_OPTIONS.minZoom}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            // Tab order belongs to the editor next door, not to thirty nodes.
            nodesFocusable={false}
            edgesFocusable={false}
            panOnDrag
            zoomOnScroll
            defaultEdgeOptions={{
              type: 'smoothstep',
              style: { stroke: 'var(--muted-foreground)', strokeWidth: 0.5 },
            }}
            proOptions={{ hideAttribution: true }}
            className="!bg-background"
          >
            <FitToPanel />
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
          </ReactFlow>
        )}
      </div>
    </>
  )
}

/**
 * Frames the graph once there is something real to frame.
 *
 * The `fitView` prop fits on init, which is before the nodes have been
 * measured and before the panel has its final width — so it computes a zoom
 * for a bounding box that does not exist yet and leaves the graph tiny and
 * half outside the panel. React Flow already tracks both facts; this waits
 * for them and fits again.
 */
function FitToPanel() {
  const initialized = useNodesInitialized()
  const width = useStore((s) => s.width)
  const height = useStore((s) => s.height)
  const { fitView } = useReactFlow()

  useEffect(() => {
    if (!initialized || width === 0 || height === 0) return
    void fitView(FIT_VIEW_OPTIONS)
  }, [initialized, width, height, fitView])

  return null
}

function PreviewEmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1.5 px-6 text-center">
      <Workflow className="mb-1 h-5 w-5 text-muted-foreground/30" />
      <p className="text-xs font-medium text-muted-foreground">No graph in this version</p>
      <p className="text-[11px] text-muted-foreground/60">Nodes added on the canvas appear here.</p>
    </div>
  )
}
