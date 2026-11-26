import { RailOverlay } from '../ui/rail-overlay'
import { InboxActions, InboxFooter, InboxList, useInboxView } from './inbox-view'

interface InboxPopoverProps {
  org: string
  onClose: () => void
}

/**
 * `Notifications`: the Inbox beside the rail (`?open=inbox`). Edit-access
 * requests are answered here. A fixed height, so switching pills doesn't make
 * it jump; the list scrolls inside. A phone opens the Inbox page instead.
 */
export function InboxPopover({ org, onClose }: InboxPopoverProps) {
  const inbox = useInboxView(org)
  return (
    <RailOverlay title="Notifications" onClose={onClose} actions={<InboxActions inbox={inbox} />}>
      <InboxList inbox={inbox} scroll />
      <InboxFooter org={org} banded />
    </RailOverlay>
  )
}
