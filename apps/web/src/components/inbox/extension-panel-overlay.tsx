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
    <RailOverlay title={panel.label} onClose={onClose}>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Body org={org} onClose={onClose} />
      </div>
    </RailOverlay>
  )
}
