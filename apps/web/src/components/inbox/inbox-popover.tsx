import { useState } from 'react'
import { Settings } from 'lucide-react'
import {
  useDecideEditRequest,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
} from '../../data/dashboard/inbox'
import { accountPath, orgPath } from '../../lib/dashboard-paths'
import { Button } from '../ui/button'
import { ListCard } from '../ui/list-card'
import { RailOverlay } from '../ui/rail-overlay'
import { SegmentedFilter, type FilterOption } from '../ui/segmented-filter'
import { ShellLink } from '../ui/shell-link'
import { LoadedQuery } from '../workspaces/loaded-query'
import { filterInbox, inboxEmptyKind, type InboxShow } from './inbox-filter'
import { InboxEmpty } from './parts/inbox-empty'
import { NotificationRow } from './parts/notification-row'

interface InboxPopoverProps {
  org: string
  onClose: () => void
}

/**
 * `Notifications`: the Inbox beside the rail (`?open=inbox`), full screen on
 * a phone. Edit-access requests are answered here. A fixed height, so
 * switching pills doesn't make it jump; the list scrolls inside.
 */
export function InboxPopover({ org, onClose }: InboxPopoverProps) {
  const notifications = useNotifications(org)
  const markRead = useMarkNotificationRead(org)
  const markAll = useMarkAllNotificationsRead(org)
  const decide = useDecideEditRequest(org)
  const [show, setShow] = useState<InboxShow>('all')
  const [answered, setAnswered] = useState<ReadonlySet<string>>(new Set())

  function handleRead(id: string) {
    markRead.mutate(id)
  }

  function handleMarkAll() {
    markAll.mutate()
  }

  // Rows keep their place by the notification's id; the decision goes to its request.
  function answer(id: string, decision: 'approve' | 'decline') {
    const request = notifications.data?.list.find((n) => n.id === id)?.request
    if (!request) return
    setAnswered((ids) => new Set(ids).add(id))
    decide.mutate({ id: request.id, decision })
  }

  function handleApprove(id: string) {
    answer(id, 'approve')
  }

  function handleDecline(id: string) {
    answer(id, 'decline')
  }

  function handleShowAll() {
    setShow('all')
  }

  const counts = notifications.data?.counts ?? { all: 0, unread: 0, action: 0 }
  const options: FilterOption<InboxShow>[] = [
    { id: 'all', label: 'All', count: counts.all },
    { id: 'unread', label: 'Unread', count: counts.unread },
    { id: 'action', label: 'Needs action', count: counts.action },
  ]

  return (
    <RailOverlay
      title="Notifications"
      onClose={onClose}
      actions={
        <>
          {counts.unread > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleMarkAll}
              disabled={markAll.isPending}
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
      }
    >
      {counts.all > 0 && (
        <div className="px-4 pb-2.5">
          <SegmentedFilter label="Show" options={options} value={show} onChange={setShow} />
        </div>
      )}
      {decide.error && (
        <p role="alert" className="px-4 pb-2 text-xs text-status-error">
          {decide.error.message}
        </p>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto border-t border-border">
        <LoadedQuery query={notifications} what="notifications" stateClassName="p-4">
          {(data) => {
            const list = filterInbox(data.list, show, answered)
            if (list.length === 0) {
              return (
                <InboxEmpty
                  kind={inboxEmptyKind(counts, show)}
                  total={counts.all}
                  settingsHref={accountPath()}
                  onShowAll={handleShowAll}
                />
              )
            }
            return (
              <ListCard label="Notifications" framed={false}>
                {list.map((notification) => (
                  <NotificationRow
                    key={notification.id}
                    notification={notification}
                    onRead={handleRead}
                    onApprove={handleApprove}
                    onDecline={handleDecline}
                  />
                ))}
              </ListCard>
            )
          }}
        </LoadedQuery>
      </div>
      <div className="flex items-center gap-2 border-t border-border bg-card px-4 py-2.5 text-2xs text-muted-foreground">
        <span className="flex-1">Failures and edit-access requests are also emailed to you.</span>
        <ShellLink href={orgPath(org, 'audit')} className="font-medium text-foreground/80">
          Audit log
        </ShellLink>
      </div>
    </RailOverlay>
  )
}
