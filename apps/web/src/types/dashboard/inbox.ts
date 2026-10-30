import type {
  InboxCounts,
  InboxNotification as ApiInboxNotification,
  NotificationKind,
} from '@awaitstep/ir'

// Dashboard types for the Inbox and What's new. A notification is the API's
// (`@awaitstep/ir`), its link resolved to a path in this org; releases are
// the web app's own (`content/releases.ts`).

export type { InboxCounts, NotificationKind }

export type InboxNotification = Omit<ApiInboxNotification, 'link'> & {
  /** "See runs" → the runs page. */
  link?: { label: string; href: string }
}

/** The Inbox as a hook gives it: the newest rows and the pills' counts over every row. */
export interface InboxList {
  list: InboxNotification[]
  counts: InboxCounts
}

export type ReleaseTag = 'new' | 'improved' | 'fixed'

export interface Release {
  id: string
  tag: ReleaseTag
  /** ISO time it shipped. */
  date: string
  title: string
  body: string
  link: { label: string; href: string }
  /** Shipped since the viewer last opened What's new. */
  fresh: boolean
}

/** What's new: every release, and when the viewer last looked (null: never). */
export interface ReleaseFeed {
  releases: Release[]
  lastVisit: string | null
}
