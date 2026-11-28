import { PanelBottom, PanelLeft, PanelRight } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { IDE_SHORTCUTS, formatShortcut, type IdeShortcutId } from '../../lib/ide/shortcuts'
import { isMacPlatform } from '../../lib/platform'
import { useIdeLayoutStore } from '../../stores/ide-layout-store'
import { PaneToggle, PaneToggles } from '../workflows/pane-toggle'

/** The workspace's three panes, shown and hidden from the status bar. */
export function LayoutToggles() {
  const { explorerOpen, dockOpen, previewOpen, toggleExplorer, toggleDock, togglePreview } =
    useIdeLayoutStore(
      useShallow((s) => ({
        explorerOpen: s.explorerOpen,
        dockOpen: s.dockOpen,
        previewOpen: s.previewOpen,
        toggleExplorer: s.toggleExplorer,
        toggleDock: s.toggleDock,
        togglePreview: s.togglePreview,
      })),
    )
  const isMac = isMacPlatform()
  const hint = (id: IdeShortcutId) => formatShortcut(IDE_SHORTCUTS[id], isMac)
  const verb = (open: boolean) => (open ? 'Hide' : 'Show')

  return (
    <PaneToggles>
      <PaneToggle
        icon={PanelLeft}
        pressed={explorerOpen}
        title={`${verb(explorerOpen)} side bar (${hint('toggleExplorer')})`}
        onClick={toggleExplorer}
      />
      <PaneToggle
        icon={PanelBottom}
        pressed={dockOpen}
        title={`${verb(dockOpen)} panel (${hint('toggleDock')})`}
        onClick={toggleDock}
      />
      {/* The third pane gets a label: "preview of what?" is not answerable from an icon. */}
      <PaneToggle
        icon={PanelRight}
        pressed={previewOpen}
        title={`${verb(previewOpen)} canvas preview (${hint('togglePreview')})`}
        onClick={togglePreview}
        label="Preview Canvas"
      />
    </PaneToggles>
  )
}
