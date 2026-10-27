import { DASHBOARD_OVERLAYS } from '../../lib/dashboard-paths'
import { InboxPopover } from './inbox-popover'
import { WhatsNewSheet } from './whats-new-sheet'

interface DashboardOverlaysProps {
  org: string
  /** `?open=`: `inbox` or `whats-new`; anything else opens nothing. */
  open: string | undefined
  onClose: () => void
}

/** The rail's Inbox and What's new, over whatever page is showing (D-P8-1). */
export function DashboardOverlays({ org, open, onClose }: DashboardOverlaysProps) {
  const overlay = DASHBOARD_OVERLAYS.find((o) => o === open)
  if (overlay === 'inbox') return <InboxPopover org={org} onClose={onClose} />
  if (overlay === 'whats-new') return <WhatsNewSheet org={org} onClose={onClose} />
  return null
}
