import { useState, useMemo, useEffect } from 'react'
import { Plus, X, Store, Search } from 'lucide-react'
import type { NodeType } from '@awaitstep/ir'
import * as Tooltip from '@radix-ui/react-tooltip'
import { cn } from '../../lib/utils'
import { isTypingTarget } from '../../lib/typing-target'
import { useNodeRegistry } from '../../contexts/node-registry-context'
import { filterNodes, paletteGroups } from '../../lib/node-categories'
import { PaletteRow } from './node-palette-row'
import { useWorkflowStore } from '../../stores/workflow-store'
import { useCanvasLayoutStore } from '../../stores/canvas-layout-store'

// Nodes that require a durable runtime (sleeps, waiting on external events).
// Functions run in a fetch handler with no step runner, so these are filtered
// out — kept in sync with `validateScript` in @awaitstep/ir.
const SCRIPT_INCOMPATIBLE_NODE_TYPES = new Set<string>(['sleep', 'sleep_until', 'wait_for_event'])

const BUILTIN_IDS = new Set([
  'step',
  'sleep',
  'sleep_until',
  'branch',
  'parallel',
  'http_request',
  'wait_for_event',
  'try_catch',
  'loop',
  'break',
  'sub_workflow',
  'sub_script',
  'race',
])

interface NodePaletteProps {
  onAddNode: (type: NodeType) => void
  /** Opens the marketplace over the canvas, keeping the graph mounted. */
  onBrowseMarketplace: () => void
}

export function NodePalette({ onAddNode, onBrowseMarketplace }: NodePaletteProps) {
  const open = useCanvasLayoutStore((s) => s.paletteOpen)
  const setOpen = useCanvasLayoutStore((s) => s.setPaletteOpen)
  const [searchTerm, setSearchTerm] = useState('')
  const { registry, customNodes } = useNodeRegistry()
  const definitions = registry.getAll()
  const kind = useWorkflowStore((s) => s.kind)
  // Installs from the marketplace dialog refresh the registry on close; the
  // registry's window-focus refresh covers installs made in another tab.

  const filteredGrouped = useMemo(() => {
    const compatibleDefs =
      kind === 'script'
        ? definitions.filter((d) => !SCRIPT_INCOMPATIBLE_NODE_TYPES.has(d.id))
        : definitions
    const items = searchTerm ? filterNodes(compatibleDefs, searchTerm) : compatibleDefs
    return paletteGroups(items)
  }, [definitions, searchTerm, kind])

  function handleToggle() {
    if (open) {
      setSearchTerm('')
    }
    setOpen(!open)
  }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'a' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (isTypingTarget(e.target)) return
        e.preventDefault()
        handleToggle()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open])

  return (
    <div className="flex flex-col items-start gap-2">
      <Tooltip.Provider delayDuration={300}>
        <Tooltip.Root>
          <Tooltip.Trigger asChild>
            <button
              onClick={handleToggle}
              aria-label="Add node"
              className={cn(
                'flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 shadow-lg transition-colors hover:bg-muted hover:border-border',
                open && 'bg-primary border-primary/60 hover:bg-primary/90',
              )}
            >
              {open ? (
                <X className="h-4 w-4 text-primary-foreground" />
              ) : (
                <Plus className="h-4 w-4 text-foreground/70" />
              )}
            </button>
          </Tooltip.Trigger>
          {!open && (
            <Tooltip.Portal>
              <Tooltip.Content
                side="right"
                sideOffset={8}
                className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground shadow-lg"
              >
                Add Node
                <span className="ml-1.5 text-muted-foreground">A</span>
                <Tooltip.Arrow className="fill-card" />
              </Tooltip.Content>
            </Tooltip.Portal>
          )}
        </Tooltip.Root>
      </Tooltip.Provider>

      {open && (
        <div className="w-xs rounded border border-border bg-card shadow-lg">
          <div className="border-b border-border px-3 py-2">
            <div className="flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5">
              <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search nodes…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
                autoFocus
              />
            </div>
          </div>

          <div className="max-h-[28rem] overflow-y-auto px-1.5">
            {filteredGrouped.map((group) => (
              <div key={group.key}>
                <div className="sticky -top-px z-10 flex items-center justify-between bg-card px-2 pb-1 pt-2">
                  <span className="text-xs font-semibold text-muted-foreground">{group.label}</span>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {group.nodes.length}
                  </span>
                </div>
                {group.nodes.map((def) => (
                  <PaletteRow
                    key={def.id}
                    definition={def}
                    source={customNodes.get(def.id)}
                    builtin={BUILTIN_IDS.has(def.id)}
                    onAdd={onAddNode}
                  />
                ))}
              </div>
            ))}
            {filteredGrouped.length === 0 && (
              <div className="py-6 text-center text-xs text-muted-foreground">
                No nodes match your search
              </div>
            )}
          </div>

          {/* Educational hint */}
          <div className="border-t text-center border-border px-3 py-2 text-xs leading-relaxed text-muted-foreground">
            Drag a node onto the canvas or click to add it.
          </div>

          <div className="border-t border-border px-1.5 py-1.5">
            <button
              type="button"
              onClick={onBrowseMarketplace}
              className="flex w-full items-center justify-center gap-2 rounded-lg px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
            >
              <Store className="h-3.5 w-3.5" aria-hidden="true" />
              Browse Marketplace
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
