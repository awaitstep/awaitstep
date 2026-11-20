import type { NodeDefinition, NodeType } from '@awaitstep/ir'
import { cn } from '../../lib/utils'
import { Button } from '../ui/button'
import { getNodeVisuals } from '../../lib/node-icon-map'
import { isCustomNodeType } from '../../lib/node-categories'
import type { CustomNodeSource } from '../../contexts/node-registry-context'

interface PaletteRowProps {
  definition: NodeDefinition
  /** Set for a Library custom node: its owner and version. */
  source: CustomNodeSource | undefined
  builtin: boolean
  onAdd: (type: NodeType) => void
  /** `pick`: a button to choose the node (Code's Add), not a row to drag onto the canvas. */
  mode?: 'palette' | 'pick'
}

/**
 * One node in the Add node palette (28k): a Library node shows its version,
 * and "Project" when the project owns it; a marketplace node says so.
 */
export function PaletteRow({
  definition,
  source,
  builtin,
  onAdd,
  mode = 'palette',
}: PaletteRowProps) {
  const visuals = getNodeVisuals(definition.id, definition.icon)
  const type = definition.id as NodeType
  const chip = source
    ? source.owner === 'project'
      ? 'Project'
      : null
    : builtin || isCustomNodeType(definition.id)
      ? null
      : 'Marketplace'

  function handleDragStart(event: React.DragEvent) {
    event.dataTransfer.setData('application/awaitstep-node-type', type)
    event.dataTransfer.effectAllowed = 'move'
  }

  function handleClick() {
    onAdd(type)
  }

  const content = (
    <>
      <div
        className={cn(
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-md',
          visuals.accent,
        )}
      >
        {visuals.paletteIcon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-xs font-medium text-foreground">{definition.name}</span>
          {chip && (
            <span
              className={cn(
                'shrink-0 rounded px-1 py-px text-2xs font-medium',
                chip === 'Project'
                  ? 'bg-node-custom/15 text-node-custom'
                  : 'bg-muted text-muted-foreground',
              )}
            >
              {chip}
            </span>
          )}
        </div>
        <div className="truncate text-xs leading-tight text-muted-foreground">
          {definition.description}
        </div>
      </div>
      {source && (
        <span className="shrink-0 text-2xs tabular-nums text-muted-foreground">
          v{source.version}
        </span>
      )}
    </>
  )

  if (mode === 'pick') {
    return (
      <Button
        type="button"
        variant="ghost"
        onClick={handleClick}
        className="h-auto w-full justify-start gap-2.5 rounded-lg px-2 py-1.5 text-left font-normal hover:bg-muted/60"
      >
        {content}
      </Button>
    )
  }

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onClick={handleClick}
      className="flex cursor-grab items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/60 active:cursor-grabbing"
    >
      {content}
    </div>
  )
}
