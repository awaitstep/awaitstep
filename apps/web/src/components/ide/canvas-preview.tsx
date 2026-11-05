import { useEffect, useMemo } from 'react'
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  useNodesInitialized,
  useReactFlow,
  useStore,
  type NodeMouseHandler,
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
import { useIdeStore } from '../../stores/ide-store'
import { highlightFor } from '../../lib/ide/step-map'
import { markedFileOf } from '../../lib/ide/tabs'
import { selectStep } from '../../lib/ide/step-actions'
import { previewSyncLabel } from '../../lib/ide/step-summary'
import { outlineCss } from '../../lib/ide/preview-outline'
import { PanToNode } from './preview-pan'
import { SaveVersionFirst } from './save-version-first'
import { StepInspector } from './step-inspector'
import { useStepSync } from './step-sync-context'
import { useMeasuredNodes } from '../../hooks/use-measured-nodes'
import { useSwitchView } from '../../hooks/use-switch-view'
import { IDE_SHORTCUTS, formatShortcut } from '../../lib/ide/shortcuts'
import { isMacPlatform } from '../../lib/platform'

const edgeTypes = { smoothstep: LabeledEdge }

const OUTLINE_SCOPE = 'ide-preview-flow'

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
 * The workflow's graph, read-only, in a resizable panel on the right of the editor.
 *
 * Code mode is a dev workspace, not a consolation prize for people who can
 * use the canvas: someone editing a step still needs to see where that step
 * sits. What it shows is the saved version's graph — the same thing the open
 * files were generated from — so it stays in step with the code on screen.
 *
 * It is docked beside the editor, not over it: a drawer hid the code it was
 * meant to sit next to. It starts at 28% of the window, wide enough to read a
 * real graph, and can be dragged or hidden; the editor narrows to make room.
 *
 * The graph follows the editor: the open file's step is outlined, a helper
 * file outlines every step that imports it, and a click on a step opens its
 * file and details. Nothing here edits the graph. Editing it is what the canvas is for, which
 * is why the way over is labelled for that rather than for the navigation:
 * "Edit on canvas" says what the canvas adds, where "Open canvas" only said
 * where it goes.
 */
export function CanvasPreview({ workflowId, versionParam }: CanvasPreviewProps) {
  const { nodes: graphNodes, edges } = useWorkflowStore(
    useShallow((s) => ({ nodes: s.nodes, edges: s.edges })),
  )
  const { map, graphVersionId, codeVersionId, versions, hasVersion } = useStepSync()
  const activePath = useIdeStore((s) => s.activePath)
  const selectedNodeId = useIdeStore((s) => s.selectedNodeId)
  const togglePreview = useIdeLayoutStore((s) => s.togglePreview)
  const styledEdges = useMemo(() => withContainerEdgeColors(graphNodes, edges), [graphNodes, edges])
  const switchView = useSwitchView(workflowId)
  const hideHint = formatShortcut(IDE_SHORTCUTS.togglePreview, isMacPlatform())

  const highlight = useMemo(() => highlightFor(map, markedFileOf(activePath)), [map, activePath])
  // Selection is drawn from the IDE's own state; the graph in the store is
  // never touched. Outlines are CSS (below), so typing in a file does not
  // rebuild any node.
  const selectable = useMemo(
    () =>
      graphNodes.map((node) => {
        const selected = node.id === selectedNodeId
        return selected === Boolean(node.selected) ? node : { ...node, selected }
      }),
    [graphNodes, selectedNodeId],
  )
  const { nodes, onNodesChange } = useMeasuredNodes(selectable)
  const outlines = outlineCss(OUTLINE_SCOPE, highlight.primary, highlight.usedBy)
  const selectedExists = selectedNodeId !== null && graphNodes.some((n) => n.id === selectedNodeId)
  const syncLabel = previewSyncLabel({ graphVersionId, codeVersionId, versions })
  const usedByCount = highlight.primary.length === 0 ? highlight.usedBy.length : 0

  function handleEditOnCanvas() {
    void switchView('canvas', {
      version: versionParam,
      ...(selectedExists && { node: selectedNodeId }),
    })
  }

  const handleNodeClick: NodeMouseHandler = (_event, node) => {
    selectStep(map, node.id, 'editor')
  }

  const handleNodeDoubleClick: NodeMouseHandler = (_event, node) => {
    void switchView('canvas', { version: versionParam, node: node.id })
  }

  function handlePaneClick() {
    useIdeStore.getState().selectNode(null)
  }

  return (
    <>
      {/* The panel's size and place belong to the workspace layout, so this
          fills whatever it is given. */}
      <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-border px-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <Workflow className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
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
          <button
            type="button"
            onClick={handleEditOnCanvas}
            title="Open the full canvas, where the graph can be edited"
            className="inline-flex h-6 items-center gap-1.5 rounded px-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
          >
            <Maximize2 className="h-3 w-3" />
            Edit on canvas
          </button>
          <button
            type="button"
            onClick={togglePreview}
            title={`Hide canvas preview (${hideHint})`}
            aria-label="Hide canvas preview"
            className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {(syncLabel || usedByCount > 0) && (
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-1 text-[11px] text-muted-foreground">
          <span className="truncate">{syncLabel}</span>
          {usedByCount > 0 && (
            <span className="shrink-0 text-foreground">
              Used by {usedByCount} {usedByCount === 1 ? 'step' : 'steps'}
            </span>
          )}
        </div>
      )}
      {selectedExists && <StepInspector nodeId={selectedNodeId} />}
      <div className={`${OUTLINE_SCOPE} min-h-0 flex-1`}>
        {outlines && <style>{outlines}</style>}
        {nodes.length === 0 ? (
          hasVersion ? (
            <PreviewEmptyState />
          ) : (
            <SaveVersionFirst workflowId={workflowId} reason="The preview shows a saved version." />
          )
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={styledEdges}
            nodeTypes={nodeTypes as NodeTypes}
            edgeTypes={edgeTypes}
            fitView
            fitViewOptions={FIT_VIEW_OPTIONS}
            minZoom={FIT_VIEW_OPTIONS.minZoom}
            onNodesChange={onNodesChange}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable
            onNodeClick={handleNodeClick}
            onNodeDoubleClick={handleNodeDoubleClick}
            onPaneClick={handlePaneClick}
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
            <PanToNode nodeId={highlight.primary[0] ?? null} />
            <PanToNode nodeId={selectedExists ? selectedNodeId : null} />
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
      <p className="text-[11px] text-muted-foreground">Nodes added on the canvas appear here.</p>
    </div>
  )
}
