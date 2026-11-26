import { useCallback, useMemo, useState, type MouseEvent, type SyntheticEvent } from 'react'
import { Handle, Position, useStore, useStoreApi, type InternalNode } from '@xyflow/react'
import { Plus } from 'lucide-react'
import type { NodeType } from '@awaitstep/ir'
import { cn } from '../../lib/utils'
import { exitConnection } from '../../lib/canvas/connection-rules'
import { HANDLE_ID, usedSides, type NodeSide } from '../../lib/canvas/node-sides'
import { useNodeRegistry } from '../../contexts/node-registry-context'
import { useWorkflowStore, type FlowNode } from '../../stores/workflow-store'
import { Popover, PopoverAnchor, PopoverContent } from '../ui/popover'
import { canLeaveSelectedNode } from './leave-guard'
import { NodeInsertList } from './node-insert-list'
import { isPressOnPlus, plusKey } from '../../lib/canvas/plus-target'

const SIDES: readonly NodeSide[] = ['top', 'left', 'bottom', 'right']

const POSITION: Record<NodeSide, Position> = {
  top: Position.Top,
  left: Position.Left,
  bottom: Position.Bottom,
  right: Position.Right,
}

/** Where a side's handle sits on the node, for the popover's anchor. */
const ANCHOR_AT: Record<NodeSide, string> = {
  top: 'left-1/2 top-0',
  left: 'left-0 top-1/2',
  bottom: 'bottom-0 left-1/2',
  right: 'right-0 top-1/2',
}

const ADD_LABEL: Record<NodeSide, string> = {
  top: 'Add a node above',
  left: 'Add a node to the left',
  bottom: 'Add a node below',
  right: 'Add a node to the right',
}

function isExit(side: NodeSide): boolean {
  return side === 'bottom' || side === 'right'
}

/**
 * The selector is portalled, but React still bubbles its events up the
 * component tree into the node — where a click would select the node, an
 * arrow key move it, a right-click open its menu. They stop at the selector.
 */
function stopAtSelector(event: SyntheticEvent) {
  event.stopPropagation()
}

interface NodeHandlesProps {
  nodeId: string
  nodeName: string
  /** Selected nodes keep their + dots showing without a hover (board 31a). */
  selected: boolean
}

/**
 * A node's four joins (board 31b): entries on the top and left, exits on the
 * bottom and right. A side an edge uses shows a small dot; on hover, and while
 * the node is selected, each free side that can take a new edge shows a +
 * that opens the node selector (31a, 31c).
 */
export function NodeHandles({ nodeId, nodeName, selected }: NodeHandlesProps) {
  // The side open, and the view it opened in: panning or zooming moves the
  // + out from under the selector, which then counts as closed.
  const [open, setOpen] = useState<{ side: NodeSide; view: string } | null>(null)
  const storeApi = useStoreApi()
  const addNodeFromSide = useWorkflowStore((s) => s.addNodeFromSide)
  const { registry } = useNodeRegistry()
  // Read from the canvas this node is drawn on, not the editor's store: the
  // Code and run previews draw the same nodes, with connecting turned off.
  const editable = useStore((s) => s.nodesConnectable)
  const edges = useStore((s) => s.edges)
  const irNode = useStore(
    useCallback(
      (s) => (s.nodeLookup.get(nodeId) as InternalNode<FlowNode> | undefined)?.data.irNode,
      [nodeId],
    ),
  )
  const view = useStore(useCallback((s) => (open ? s.transform.join(',') : null), [open]))
  const openSide = open && open.view === view ? open.side : null

  const used = useMemo(() => usedSides(nodeId, edges), [nodeId, edges])
  const canExit = useMemo(() => {
    if (!irNode) return false
    return exitConnection(
      irNode,
      edges.filter((e) => e.source === nodeId),
    ).allowed
  }, [irNode, edges, nodeId])

  function handleAdd(side: NodeSide) {
    if (openSide === side) {
      setOpen(null)
      return
    }
    // Adding selects the new node, so it leaves the selected one like a click would.
    if (!canLeaveSelectedNode(null)) return
    setOpen({ side, view: storeApi.getState().transform.join(',') })
  }

  function handleOpenChange(next: boolean) {
    if (!next) setOpen(null)
  }

  // A press on this + is the toggle's, not an outside click closing it.
  function handleInteractOutside(event: Event) {
    if (openSide && isPressOnPlus(event.target, plusKey(nodeId, openSide))) event.preventDefault()
  }

  function handlePick(type: NodeType) {
    if (openSide) addNodeFromSide(nodeId, openSide, type, registry)
    setOpen(null)
  }

  return (
    <Popover open={openSide !== null} onOpenChange={handleOpenChange}>
      {SIDES.map((side) => {
        const inUse = used.has(side)
        const canAdd = editable && !inUse && (!isExit(side) || canExit)
        return (
          <SideHandle
            key={side}
            nodeId={nodeId}
            side={side}
            inUse={inUse}
            canAdd={canAdd}
            connectable={editable}
            showPlus={selected || openSide === side}
            onAdd={handleAdd}
          />
        )
      })}
      {openSide && (
        <PopoverAnchor
          className={cn('pointer-events-none absolute h-0 w-0', ANCHOR_AT[openSide])}
        />
      )}
      {openSide && (
        <PopoverContent
          side={openSide}
          align="start"
          sideOffset={14}
          onInteractOutside={handleInteractOutside}
          className="nodrag nowheel w-[300px] max-h-[min(480px,var(--radix-popover-content-available-height))]"
        >
          <div
            className="flex min-h-0 flex-1 flex-col"
            onClick={stopAtSelector}
            onDoubleClick={stopAtSelector}
            onContextMenu={stopAtSelector}
            onKeyDown={stopAtSelector}
            onPointerDown={stopAtSelector}
            onMouseDown={stopAtSelector}
          >
            <NodeInsertList side={openSide} fromName={nodeName} onPick={handlePick} />
          </div>
        </PopoverContent>
      )}
    </Popover>
  )
}

interface SideHandleProps {
  nodeId: string
  side: NodeSide
  inUse: boolean
  canAdd: boolean
  /**
   * Drags may start here. An exit stays draggable even when its node can take
   * no more edges: dragging it onto a node it already joins moves that edge
   * to this side, and the store turns away any other new edge.
   */
  connectable: boolean
  /** Show the + without a hover: the node is selected, or its selector is open. */
  showPlus: boolean
  onAdd: (side: NodeSide) => void
}

/**
 * One side's handle. Its own box stays one size whatever it shows, so React
 * Flow's measured end point for an edge never shifts; the dot and the + are
 * drawn inside it, centred.
 */
function SideHandle({
  nodeId,
  side,
  inUse,
  canAdd,
  connectable,
  showPlus,
  onAdd,
}: SideHandleProps) {
  function handleClick(event: MouseEvent) {
    if (!canAdd) return
    event.stopPropagation()
    onAdd(side)
  }

  const addLabel = canAdd ? ADD_LABEL[side] : undefined
  const plusData = canAdd ? plusKey(nodeId, side) : undefined

  return (
    <Handle
      id={HANDLE_ID[side]}
      type={isExit(side) ? 'source' : 'target'}
      position={POSITION[side]}
      isConnectableStart={connectable}
      onClick={handleClick}
      aria-label={addLabel}
      data-plus={plusData}
      className={cn(
        '!flex !h-[10px] !w-[10px] !items-center !justify-center !rounded-full !border-0 !bg-transparent',
        canAdd && '!cursor-pointer',
      )}
    >
      {inUse && (
        <span
          aria-hidden
          className="pointer-events-none h-[7px] w-[7px] shrink-0 rounded-full border border-card bg-muted-foreground"
        />
      )}
      {canAdd && (
        <span
          aria-hidden
          className={cn(
            'flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border border-primary-ink bg-card text-primary-ink opacity-0 shadow-[0_0_0_3px_var(--background)] transition-opacity duration-100 group-hover:opacity-100',
            showPlus && 'opacity-100',
          )}
        >
          <Plus strokeWidth={2.6} className="h-[11px] w-[11px]" />
        </span>
      )}
    </Handle>
  )
}
