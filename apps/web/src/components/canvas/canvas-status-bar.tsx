import { Code2, Lock, PanelLeft, PanelRight } from 'lucide-react'
import { useInspectorToggle } from '../../hooks/use-inspector-toggle'
import { IDE_SHORTCUTS, formatShortcut } from '../../lib/ide/shortcuts'
import { isMacPlatform } from '../../lib/platform'
import { useCanvasLayoutStore } from '../../stores/canvas-layout-store'
import { PaneToggle, PaneToggles } from '../workflows/pane-toggle'

interface CanvasStatusBarProps {
  readOnly: boolean
  /** Why the graph can't be edited, when it can't. */
  readOnlyReason?: string
}

/** The line under the canvas: whether it can be edited, and which panes show. */
export function CanvasStatusBar({ readOnly, readOnlyReason }: CanvasStatusBarProps) {
  const paletteOpen = useCanvasLayoutStore((s) => s.paletteOpen)
  const codePreviewOpen = useCanvasLayoutStore((s) => s.codePreviewOpen)
  const togglePalette = useCanvasLayoutStore((s) => s.togglePalette)
  const toggleCodePreview = useCanvasLayoutStore((s) => s.toggleCodePreview)
  const inspector = useInspectorToggle()
  const isMac = isMacPlatform()
  const hint = (id: keyof typeof IDE_SHORTCUTS) => formatShortcut(IDE_SHORTCUTS[id], isMac)

  return (
    <div
      aria-label="Canvas status"
      className="flex h-6 shrink-0 items-center gap-0.5 border-t border-border bg-card px-1.5 text-2xs text-muted-foreground"
    >
      <span className="flex-1" />
      {readOnly && (
        <span className="inline-flex items-center gap-1 px-2" title={readOnlyReason}>
          <Lock className="h-3 w-3" />
          Read-only
        </span>
      )}
      <PaneToggles>
        <PaneToggle
          icon={PanelLeft}
          pressed={paletteOpen && !readOnly}
          disabled={readOnly}
          title={
            readOnly
              ? 'Nodes (nothing to add while read-only)'
              : `Nodes (${hint('toggleExplorer')})`
          }
          onClick={togglePalette}
        />
        <PaneToggle
          icon={PanelRight}
          pressed={inspector.visible}
          title={`Inspector (${hint('toggleDock')})`}
          onClick={inspector.toggle}
        />
        {/* The graph, and the code it generates, are the two things worth seeing here. */}
        <PaneToggle
          icon={Code2}
          pressed={codePreviewOpen}
          title={`${codePreviewOpen ? 'Hide' : 'Show'} generated code preview`}
          onClick={toggleCodePreview}
          label="Preview Code"
        />
      </PaneToggles>
    </div>
  )
}
