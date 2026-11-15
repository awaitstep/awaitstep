import { useRef } from 'react'
import { GitBranch, MoreHorizontal, Plus, Trash2 } from 'lucide-react'
import { CONTINUE_LABEL } from '@awaitstep/ir'
import type { StepPlacement } from '@awaitstep/codegen'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'

/** One connection out of a step, as the menu offers it. */
export interface StepOutgoingEdge {
  id: string
  label?: string
  /** The node the connection leads to, named when it has no label. */
  targetName: string
  /** The edge leaves through one of the node's arms, not as its way on. */
  arm: boolean
  /** The id names one edge. A shared id has no safe splice, so the item is disabled. */
  uniqueId: boolean
}

/** A slot of a branching node with nothing in it yet: an empty arm, or after the block. */
export interface StepOpenArm {
  /** The arm's label; `then` is after the block, null a new arm of a parallel or race. */
  arm: string | null
  placement: StepPlacement
  /** "Into catch", "New arm of Fan out", "After Loop". */
  label: string
}

interface StepRowMenuProps {
  nodeId: string
  name: string
  outgoing: readonly StepOutgoingEdge[]
  /** A branching node (its slots are named, so it never takes a plain "after"). */
  branching: boolean
  /** Its slots with nothing in them; each gets its own entry. */
  openArms: readonly StepOpenArm[]
  onChoose: (placement: StepPlacement) => void
  /** Asks to remove this node: the dialog, or a toast saying why Code can't. */
  onRemove: (nodeId: string) => void
  /** The workspace cannot edit: the trigger stays in place, disabled, with the reason. */
  disabled: boolean
  disabledReason: string | null
}

/**
 * The Steps list's row menu. A step with nothing or one connection after it
 * gets one "New step after…"; a branch or container lists one entry per
 * connection, named by its label or the node it leads to, and one per empty
 * slot (an empty arm, a new arm, after the block). "Remove…" opens the remove
 * dialog, or says in a toast why Code can't remove the node.
 */
export function StepRowMenu({
  nodeId,
  name,
  outgoing,
  branching,
  openArms,
  onChoose,
  onRemove,
  disabled,
  disabledReason,
}: StepRowMenuProps) {
  // A chosen item opens the name row, which takes focus itself: Radix must
  // not hand focus back to the row's ⋯ button. Dismissing the menu without a
  // choice leaves focus where it belongs (the trigger).
  const chosen = useRef(false)

  // Reset on open, not on close: `onCloseAutoFocus` runs after the close
  // event and must still see whether something was chosen.
  function handleOpenChange(open: boolean) {
    if (open) chosen.current = false
  }

  function handleCloseAutoFocus(event: Event) {
    if (!chosen.current) return
    chosen.current = false
    event.preventDefault()
  }

  function choose(placement: StepPlacement) {
    chosen.current = true
    onChoose(placement)
  }

  // The dialog takes focus itself, as the name row does.
  function handleRemove() {
    chosen.current = true
    onRemove(nodeId)
  }

  // `{ after }` is only truthful for a node with no connection or one plain
  // connection; an arm is spliced before its target, so it needs its own item.
  const only = outgoing.length === 1 ? outgoing[0]! : undefined
  const append = outgoing.length === 0 || (only !== undefined && !only.arm && only.uniqueId)

  return (
    <DropdownMenu onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          aria-disabled={disabled}
          aria-label={`Step actions for ${name}`}
          title={
            disabled
              ? (disabledReason ?? 'You can view this workflow but not edit it.')
              : 'Step actions'
          }
          onClick={handleMenuButtonClick}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-muted/70 hover:text-foreground focus:opacity-100 group-focus-visible:opacity-100 group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-40 data-[state=open]:opacity-100"
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="min-w-[190px]"
        onCloseAutoFocus={handleCloseAutoFocus}
      >
        {branching ? (
          <BranchingItems
            nodeId={nodeId}
            outgoing={outgoing}
            openArms={openArms}
            onChoose={choose}
          />
        ) : append ? (
          <DropdownMenuItem onSelect={() => choose({ after: nodeId })} className="text-xs">
            <Plus className="h-3.5 w-3.5" />
            New step after…
          </DropdownMenuItem>
        ) : only !== undefined ? (
          <DropdownMenuItem
            disabled={!only.uniqueId}
            title={only.uniqueId ? undefined : SHARED_REASON}
            onSelect={() => choose({ after: nodeId, edgeId: only.id })}
            className="text-xs"
          >
            <Plus className="h-3.5 w-3.5" />
            {edgeLabel(only)}
          </DropdownMenuItem>
        ) : (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="text-xs">
              <Plus className="h-3.5 w-3.5" />
              New step after…
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {outgoing.map((edge, at) => (
                <EdgeItem key={`${at}:${edge.id}`} nodeId={nodeId} edge={edge} onChoose={choose} />
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={handleRemove}
          className="text-xs text-destructive focus:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Remove…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const SHARED_REASON = 'This connection shares its id with another edge. Rename one on the canvas.'

interface BranchingItemsProps {
  nodeId: string
  outgoing: readonly StepOutgoingEdge[]
  openArms: readonly StepOpenArm[]
  onChoose: (placement: StepPlacement) => void
}

/**
 * A branching node's two ways to add: after the whole block (its `then`,
 * spliced before what already follows, or started), and into one of its
 * arms — a connection to splice into, or an empty arm to start.
 */
function BranchingItems({ nodeId, outgoing, openArms, onChoose }: BranchingItemsProps) {
  const thenEdge = outgoing.find((edge) => edge.label === CONTINUE_LABEL)
  const thenSlot = openArms.find((slot) => slot.arm === CONTINUE_LABEL)
  const armEdges = outgoing.filter((edge) => edge.arm)
  const emptyArms = openArms.filter((slot) => slot !== thenSlot)

  function handleAfter() {
    if (thenEdge) onChoose({ after: nodeId, edgeId: thenEdge.id })
    else if (thenSlot) onChoose(thenSlot.placement)
  }

  return (
    <>
      {(thenEdge || thenSlot) && (
        <DropdownMenuItem
          disabled={thenEdge !== undefined && !thenEdge.uniqueId}
          title={thenEdge && !thenEdge.uniqueId ? SHARED_REASON : undefined}
          onSelect={handleAfter}
          className="text-xs"
        >
          <Plus className="h-3.5 w-3.5" />
          New step after…
        </DropdownMenuItem>
      )}
      {armEdges.length + emptyArms.length > 0 && (
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="text-xs">
            <GitBranch className="h-3.5 w-3.5" />
            Add to a branch
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {armEdges.map((edge, at) => (
              <EdgeItem key={`${at}:${edge.id}`} nodeId={nodeId} edge={edge} onChoose={onChoose} />
            ))}
            {emptyArms.map((slot) => (
              <DropdownMenuItem
                key={slot.label}
                onSelect={() => onChoose(slot.placement)}
                className="text-xs"
              >
                {slot.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      )}
    </>
  )
}

function EdgeItem({
  nodeId,
  edge,
  onChoose,
}: {
  nodeId: string
  edge: StepOutgoingEdge
  onChoose: (placement: StepPlacement) => void
}) {
  return (
    <DropdownMenuItem
      disabled={!edge.uniqueId}
      title={edge.uniqueId ? undefined : SHARED_REASON}
      onSelect={() => onChoose({ after: nodeId, edgeId: edge.id })}
      className="text-xs"
    >
      {edgeLabel(edge)}
    </DropdownMenuItem>
  )
}

/** "Into body" for a labelled arm; "Before <target>" for anything else. */
function edgeLabel(edge: StepOutgoingEdge): string {
  return edge.arm && edge.label ? `Into ${edge.label}` : `Before ${edge.targetName}`
}

/** Clicking ⋯ must not also pick the row. */
function handleMenuButtonClick(event: React.MouseEvent) {
  event.stopPropagation()
}
