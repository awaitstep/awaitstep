import { findExtensionPanel, useEnabledExtensions } from '../../extensions/registry'
import { DASHBOARD_OVERLAYS } from '../../lib/dashboard-paths'
import { ExtensionPanelOverlay } from './extension-panel-overlay'
import { InboxPopover } from './inbox-popover'
import { WhatsNewSheet } from './whats-new-sheet'

interface DashboardOverlaysProps {
  org: string
  /** `?open=`: `inbox`, `whats-new` or an enabled extension's panel id; anything else opens nothing. */
  open: string | undefined
  onClose: () => void
}

/** The rail's Inbox, What's new and extension panels, over whatever page is showing (D-P8-1). */
export function DashboardOverlays({ org, open, onClose }: DashboardOverlaysProps) {
  const extensions = useEnabledExtensions()
  const overlay = DASHBOARD_OVERLAYS.find((o) => o === open)
  if (overlay === 'inbox') return <InboxPopover org={org} onClose={onClose} />
  if (overlay === 'whats-new') return <WhatsNewSheet org={org} onClose={onClose} />
  const panel = findExtensionPanel(extensions, open)
  if (panel) return <ExtensionPanelOverlay panel={panel} org={org} onClose={onClose} />
  return null
}
