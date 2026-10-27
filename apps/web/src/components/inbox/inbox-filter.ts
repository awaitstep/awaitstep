import type { InboxNotification, Release, ReleaseTag } from '../../types/dashboard/inbox'

/** The Inbox's Show pills. */
export type InboxShow = 'all' | 'unread' | 'action'

export function inboxCounts(list: InboxNotification[]): Record<InboxShow, number> {
  return {
    all: list.length,
    unread: list.filter((n) => !n.read).length,
    action: list.filter((n) => n.needsAction).length,
  }
}

/**
 * The rows a pill shows. `keep` holds rows answered while the list is open:
 * they stay, so their outcome shows (and takes focus) where Approve was.
 */
export function filterInbox(
  list: InboxNotification[],
  show: InboxShow,
  keep: ReadonlySet<string> = new Set(),
): InboxNotification[] {
  if (show === 'unread') return list.filter((n) => !n.read || keep.has(n.id))
  if (show === 'action') return list.filter((n) => n.needsAction || keep.has(n.id))
  return list
}

/** What's new's pills: every release, or one tag. */
export type ReleaseShow = 'all' | ReleaseTag

export function filterReleases(list: Release[], show: ReleaseShow): Release[] {
  return show === 'all' ? list : list.filter((r) => r.tag === show)
}
