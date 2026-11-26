import { useState } from 'react'
import { Settings } from 'lucide-react'
import {
  useDecideEditRequest,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
} from '../../data/dashboard/inbox'
import { accountPath, orgPath } from '../../lib/dashboard-paths'
import { cn } from '../../lib/utils'
import { Button } from '../ui/button'
import { ListCard } from '../ui/list-card'
import { SegmentedFilter, type FilterOption } from '../ui/segmented-filter'
import { ShellLink } from '../ui/shell-link'
import { LoadedQuery } from '../workspaces/loaded-query'
import { filterInbox, inboxEmptyKind, type InboxShow } from './inbox-filter'
import { InboxEmpty } from './parts/inbox-empty'
import { NotificationRow } from './parts/notification-row'

/**
 * The Inbox's state and actions, shared by its two frames: the overlay beside
 * the rail and the phone's Inbox page.
 */
export function useInboxView(org: string) {
  const notifications = useNotifications(org)
  const markRead = useMarkNotificationRead(org)
  const markAll = useMarkAllNotificationsRead(org)
  const decide = useDecideEditRequest(org)
  const [show, setShow] = useState<InboxShow>('all')
  const [answered, setAnswered] = useState<ReadonlySet<string>>(new Set())
  const counts = notifications.data?.counts ?? { all: 0, unread: 0, action: 0 }

  // Rows keep their place by the notification's id; the decision goes to its request.
  function answer(id: string, decision: 'approve' | 'decline') {
    const request = notifications.data?.list.find((n) => n.id === id)?.request
    if (!request) return
    setAnswered((ids) => new Set(ids).add(id))
    decide.mutate({ id: request.id, decision })
  }

  return {
    org,
    notifications,
    counts,
    show,
    setShow,
    answered,
    decideError: decide.error,
    markingAll: markAll.isPending,
    markAll: () => markAll.mutate(),
    read: (id: string) => markRead.mutate(id),
    approve: (id: string) => answer(id, 'approve'),
    decline: (id: string) => answer(id, 'decline'),
    showAll: () => setShow('all'),
  }
}

export type InboxView = ReturnType<typeof useInboxView>

/** Mark all as read, and the way to notification settings. */
export function InboxActions({ inbox }: { inbox: InboxView }) {
  return (
    <>
      {inbox.counts.unread > 0 && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={inbox.markAll}
          disabled={inbox.markingAll}
          className="text-status-success"
        >
          Mark all as read
        </Button>
      )}
      <ShellLink
        href={accountPath()}
        aria-label="Notification settings"
        className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <Settings className="size-4" aria-hidden="true" />
      </ShellLink>
    </>
  )
}

/** The filter pills and the notifications. `scroll` keeps the list scrolling inside a fixed frame. */
export function InboxList({ inbox, scroll }: { inbox: InboxView; scroll?: boolean }) {
  const options: FilterOption<InboxShow>[] = [
    { id: 'all', label: 'All', count: inbox.counts.all },
    { id: 'unread', label: 'Unread', count: inbox.counts.unread },
    { id: 'action', label: 'Needs action', count: inbox.counts.action },
  ]
  return (
    <>
      {inbox.counts.all > 0 && (
        <div className={cn(scroll && 'px-4 pb-2.5')}>
          <SegmentedFilter
            label="Show"
            options={options}
            value={inbox.show}
            onChange={inbox.setShow}
          />
        </div>
      )}
      {inbox.decideError && (
        <p role="alert" className={cn('text-xs text-status-error', scroll && 'px-4 pb-2')}>
          {inbox.decideError.message}
        </p>
      )}
      <div
        className={cn(
          scroll
            ? 'min-h-0 flex-1 overflow-y-auto border-t border-border'
            : 'overflow-hidden rounded border border-border bg-card',
        )}
      >
        <LoadedQuery query={inbox.notifications} what="notifications" stateClassName="p-4">
          {(data) => {
            const list = filterInbox(data.list, inbox.show, inbox.answered)
            if (list.length === 0) {
              return (
                <InboxEmpty
                  kind={inboxEmptyKind(inbox.counts, inbox.show)}
                  total={inbox.counts.all}
                  settingsHref={accountPath()}
                  onShowAll={inbox.showAll}
                />
              )
            }
            return (
              <ListCard label="Notifications" framed={false}>
                {list.map((notification) => (
                  <NotificationRow
                    key={notification.id}
                    notification={notification}
                    onRead={inbox.read}
                    onApprove={inbox.approve}
                    onDecline={inbox.decline}
                  />
                ))}
              </ListCard>
            )
          }}
        </LoadedQuery>
      </div>
    </>
  )
}

/** The note under the list: what is also emailed, and the Audit log. */
export function InboxFooter({ org, banded }: { org: string; banded?: boolean }) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 text-2xs text-muted-foreground',
        banded && 'border-t border-border bg-card px-4 py-2.5',
      )}
    >
      <span className="flex-1">Failures and edit-access requests are also emailed to you.</span>
      <ShellLink href={orgPath(org, 'audit')} className="font-medium text-foreground/80">
        Audit log
      </ShellLink>
    </div>
  )
}
