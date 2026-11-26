import { PageBody, PageIntro } from '../shell/page-intro'
import { InboxActions, InboxFooter, InboxList, useInboxView } from './inbox-view'

/**
 * The Inbox as a page, where the phone's tab bar goes: in the frame, with the
 * top bar and tab bar still there, rather than an overlay over everything.
 */
export function InboxPage({ org }: { org: string }) {
  const inbox = useInboxView(org)
  return (
    <PageBody>
      <PageIntro
        title="Notifications"
        action={
          <div className="flex items-center gap-1">
            <InboxActions inbox={inbox} />
          </div>
        }
      />
      <div className="flex flex-col gap-3">
        <InboxList inbox={inbox} />
        <InboxFooter org={org} />
      </div>
    </PageBody>
  )
}
