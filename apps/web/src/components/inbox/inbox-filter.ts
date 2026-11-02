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

/**
 * Which zero the Inbox shows: nothing ever arrived, nothing unread, nothing waiting on you,
 * or (`older`) a match the listed rows don't hold because the Inbox lists only the newest.
 */
export type InboxEmptyKind = 'none' | 'read' | 'done' | 'older'

/** Chosen from `counts`, which cover every notification, not from the rows listed. */
export function inboxEmptyKind(counts: Record<InboxShow, number>, show: InboxShow): InboxEmptyKind {
  if (counts.all === 0) return 'none'
  if (show === 'unread') return counts.unread === 0 ? 'read' : 'older'
  if (show === 'action') return counts.action === 0 ? 'done' : 'older'
  return 'none'
}

/** What's new's pills: every release, or one tag. */
export type ReleaseShow = 'all' | ReleaseTag

export function filterReleases(list: Release[], show: ReleaseShow): Release[] {
  return show === 'all' ? list : list.filter((r) => r.tag === show)
}

/** What the body of What's new shows: the notes, a tag with none, or no notes at all. */
export type ReleasesView = 'list' | 'nomatch' | 'none'

export function releasesView(list: Release[], show: ReleaseShow): ReleasesView {
  if (list.length === 0) return 'none'
  return filterReleases(list, show).length === 0 ? 'nomatch' : 'list'
}

/** Notes exist and none is new to the viewer. */
export function isUpToDate(list: Release[]): boolean {
  return list.length > 0 && !list.some((r) => r.fresh)
}
