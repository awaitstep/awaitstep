import { useRef } from 'react'
import { MoreHorizontal, Plus } from 'lucide-react'
import type { StepPlacement } from '@awaitstep/codegen'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
}

interface StepRowMenuProps {
  nodeId: string
  name: string
  outgoing: readonly StepOutgoingEdge[]
  onChoose: (placement: StepPlacement) => void
  /** The workspace cannot edit: the trigger stays in place, disabled, with the reason. */
  disabled: boolean
  disabledReason: string | null
}

/**
 * The Steps list's row menu. A step with nothing or one connection after it
 * gets one "New step after…"; a branch or container lists one entry per
 * connection, named by its label or the node it leads to.
 */
export function StepRowMenu({
  nodeId,
  name,
  outgoing,
  onChoose,
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

  return (
    <DropdownMenu onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          aria-disabled={disabled}
          aria-label={`New step after ${name}`}
          title={
            disabled
              ? (disabledReason ?? 'You can view this workflow but not edit it.')
              : 'New step after…'
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
        {outgoing.length <= 1 ? (
          <DropdownMenuItem onSelect={() => choose({ after: nodeId })} className="text-xs">
            <Plus className="h-3.5 w-3.5" />
            New step after…
          </DropdownMenuItem>
        ) : (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="text-xs">
              <Plus className="h-3.5 w-3.5" />
              New step after…
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {outgoing.map((edge) => (
                <DropdownMenuItem
                  key={`${edge.id}:${edge.targetName}`}
                  onSelect={() => choose({ after: nodeId, edgeId: edge.id })}
                  className="text-xs"
                >
                  {edge.label ? `Into ${edge.label}` : `Before ${edge.targetName}`}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Clicking ⋯ must not also pick the row. */
function handleMenuButtonClick(event: React.MouseEvent) {
  event.stopPropagation()
}
