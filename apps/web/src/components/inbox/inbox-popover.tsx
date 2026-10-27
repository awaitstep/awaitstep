import { useState } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { Settings, X } from 'lucide-react'
import {
  useDecideEditRequest,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
} from '../../data/dashboard/inbox'
import { accountPath, orgPath } from '../../lib/dashboard-paths'
import { Button } from '../ui/button'
import { ListCard } from '../ui/list-card'
import { SegmentedFilter, type FilterOption } from '../ui/segmented-filter'
import { ShellLink } from '../ui/shell-link'
import { LoadedQuery } from '../workspaces/loaded-query'
import { filterInbox, inboxCounts, type InboxShow } from './inbox-filter'
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

  function handleOpenChange(open: boolean) {
    if (!open) onClose()
  }

  function handleRead(id: string) {
    markRead.mutate(id)
  }

  function handleMarkAll() {
    markAll.mutate()
  }

  function answer(id: string, decision: 'approve' | 'decline') {
    setAnswered((ids) => new Set(ids).add(id))
    decide.mutate({ id, decision })
  }

  function handleApprove(id: string) {
    answer(id, 'approve')
  }

  function handleDecline(id: string) {
    answer(id, 'decline')
  }

  const list = notifications.data ?? []
  const counts = inboxCounts(list)
  const options: FilterOption<InboxShow>[] = [
    { id: 'all', label: 'All', count: counts.all },
    { id: 'unread', label: 'Unread', count: counts.unread },
    { id: 'action', label: 'Needs action', count: counts.action },
  ]

  return (
    <DialogPrimitive.Root open onOpenChange={handleOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-card text-card-foreground focus-visible:outline-none md:inset-auto md:bottom-4 md:left-[84px] md:h-[min(700px,calc(100vh-32px))] md:w-[420px] md:rounded-2xl md:border md:border-border md:shadow-2xl"
        >
          <div className="flex items-center gap-2 px-4 pb-2.5 pt-3.5">
            <DialogPrimitive.Title className="flex-1 text-base font-semibold">
              Notifications
            </DialogPrimitive.Title>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleMarkAll}
              disabled={counts.unread === 0 || markAll.isPending}
              className="text-status-success"
            >
              Mark all as read
            </Button>
            <ShellLink
              href={accountPath(org)}
              aria-label="Notification settings"
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Settings className="size-4" aria-hidden="true" />
            </ShellLink>
            <DialogPrimitive.Close
              aria-label="Close"
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="size-4" aria-hidden="true" />
            </DialogPrimitive.Close>
          </div>
          <div className="px-4 pb-2.5">
            <SegmentedFilter label="Show" options={options} value={show} onChange={setShow} />
          </div>
          {decide.error && (
            <p role="alert" className="px-4 pb-2 text-xs text-status-error">
              {decide.error.message}
            </p>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto border-t border-border">
            <LoadedQuery query={notifications} what="notifications">
              {(data) => (
                <ListCard
                  label="Notifications"
                  framed={false}
                  empty={
                    <span className="flex flex-col gap-1.5 py-6">
                      <span className="text-sm font-medium text-foreground">
                        You’re all caught up
                      </span>
                      New failures, requests and expiring keys show up here.
                    </span>
                  }
                >
                  {filterInbox(data, show, answered).map((notification) => (
                    <NotificationRow
                      key={notification.id}
                      notification={notification}
                      onRead={handleRead}
                      onApprove={handleApprove}
                      onDecline={handleDecline}
                    />
                  ))}
                </ListCard>
              )}
            </LoadedQuery>
          </div>
          <div className="flex items-center gap-2 border-t border-border bg-card px-4 py-2.5 text-2xs text-muted-foreground">
            <span className="flex-1">
              Failures and edit-access requests are also emailed to you.
            </span>
            <ShellLink href={orgPath(org, 'audit')} className="font-medium text-foreground/80">
              Audit log
            </ShellLink>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
