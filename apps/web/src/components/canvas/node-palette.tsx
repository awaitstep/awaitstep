import { useState } from 'react'
import { Plus, X, Store } from 'lucide-react'
import type { NodeType } from '@awaitstep/ir'
import * as Tooltip from '@radix-ui/react-tooltip'
import { cn } from '../../lib/utils'
import { useNodeRegistry } from '../../contexts/node-registry-context'
import { getNodeVisuals } from '../../lib/node-icon-map'
import { MarketplaceDialog } from '../marketplace/marketplace-dialog'

const BUILTIN_IDS = new Set([
  'step',
  'sleep',
  'sleep_until',
  'branch',
  'parallel',
  'http_request',
  'wait_for_event',
])

interface NodePaletteProps {
  onAddNode: (type: NodeType) => void
}

export function NodePalette({ onAddNode }: NodePaletteProps) {
  const [open, setOpen] = useState(false)
  const [marketplaceOpen, setMarketplaceOpen] = useState(false)
  const { registry } = useNodeRegistry()
  const definitions = registry.getAll()

  const onDragStart = (event: React.DragEvent, nodeType: NodeType) => {
    event.dataTransfer.setData('application/awaitstep-node-type', nodeType)
    event.dataTransfer.effectAllowed = 'move'
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Tooltip.Provider delayDuration={300}>
        <Tooltip.Root>
          <Tooltip.Trigger asChild>
            <button
              onClick={() => setOpen(!open)}
              className={cn(
                'flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-card shadow-lg transition-all hover:bg-muted hover:border-border',
                open && 'bg-primary border-primary/60 hover:bg-primary/90',
              )}
            >
              {open ? (
                <X className="h-4 w-4 text-primary-foreground" />
              ) : (
                <Plus className="h-5 w-5 text-foreground/70" />
              )}
            </button>
          </Tooltip.Trigger>
          {!open && (
            <Tooltip.Portal>
              <Tooltip.Content
                side="right"
                sideOffset={8}
                className="rounded-lg bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-900 shadow-lg"
              >
                Add Node
                <Tooltip.Arrow className="fill-white" />
              </Tooltip.Content>
            </Tooltip.Portal>
          )}
        </Tooltip.Root>
      </Tooltip.Provider>

      {open && (
        <div className="w-64 rounded-xl border border-border bg-card py-1.5 shadow-lg">
          <div className="mb-1 px-3.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/40">
            Drag to canvas
          </div>
          <div className="max-h-80 overflow-y-auto px-1.5">
            {definitions.map((def) => {
              const visuals = getNodeVisuals(def.id, def.icon)
              return (
                <div
                  key={def.id}
                  draggable
                  onDragStart={(e) => onDragStart(e, def.id as NodeType)}
                  onClick={() => onAddNode(def.id as NodeType)}
                  className="flex cursor-grab items-center gap-2.5 rounded-lg px-2 py-1.5 transition-all hover:bg-muted/60 active:cursor-grabbing"
                >
                  <div
                    className={cn(
                      'flex h-7 w-7 shrink-0 items-center justify-center rounded-md',
                      visuals.accent,
                    )}
                  >
                    {visuals.paletteIcon}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[12px] font-medium text-foreground">{def.name}</span>
                      {!BUILTIN_IDS.has(def.id) && (
                        <span className="rounded bg-violet-500/15 px-1 py-px text-[9px] font-medium text-violet-400">
                          Custom
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] leading-tight text-muted-foreground/60">
                      {def.description}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          <div className="mt-1 border-t border-border px-1.5 pt-1.5">
            <button
              onClick={() => setMarketplaceOpen(true)}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
            >
              <Store className="h-3.5 w-3.5" />
              Browse Marketplace
            </button>
          </div>
        </div>
      )}

      <MarketplaceDialog open={marketplaceOpen} onOpenChange={setMarketplaceOpen} />
    </div>
  )
}
