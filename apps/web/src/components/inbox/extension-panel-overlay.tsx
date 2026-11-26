import type { ExtensionPanel } from '../../extensions/types'
import { RailOverlay } from '../ui/rail-overlay'

interface ExtensionPanelOverlayProps {
  panel: ExtensionPanel
  org: string
  onClose: () => void
}

/** An extension's rail panel (`?open=<id>`), framed as the Inbox is. The extension draws only the body. */
export function ExtensionPanelOverlay({ panel, org, onClose }: ExtensionPanelOverlayProps) {
  const Body = panel.component
  return (
    // As tall as what the extension draws: a short panel (Help) leaves no empty card.
    <RailOverlay title={panel.label} onClose={onClose} fit>
      <div className="min-h-0 overflow-y-auto pb-2">
        <Body org={org} onClose={onClose} />
      </div>
    </RailOverlay>
  )
}
