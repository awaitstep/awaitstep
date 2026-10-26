// Dashboard types for the Inbox and What's new. Web-only until B8 moves them.

/** Sets the row's icon and tint. */
export type NotificationKind = 'failure' | 'request' | 'expiry' | 'people' | 'deploy'

export interface InboxNotification {
  id: string
  kind: NotificationKind
  title: string
  /** "Project 101 · Sales". */
  where: string
  at: string
  read: boolean
  /** Shown under "Needs action". */
  needsAction: boolean
  /** "See runs" → the runs page. */
  link?: { label: string; href: string }
  /** An edit-access request someone can approve or decline from the inbox. */
  request?: {
    status: 'pending' | 'approved' | 'declined'
    /** Once decided: "Approved. Daniel is now an Editor in Sales." */
    outcome?: string
  }
}

export type ReleaseTag = 'new' | 'improved' | 'fixed'

export interface Release {
  id: string
  tag: ReleaseTag
  /** ISO date it shipped. */
  date: string
  title: string
  body: string
  link: { label: string; href: string }
  /** Shipped since the viewer last opened What's new. */
  fresh: boolean
}
