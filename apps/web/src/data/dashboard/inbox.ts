import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ReleaseVisit } from '@awaitstep/ir'
import { defineToast } from '../../lib/action-toast'
import { useEffect } from 'react'
import { RELEASE_NOTES } from '../../content/releases'
import { dashboardApi } from '../../lib/dashboard-api'
import { releaseFeed } from '../../lib/release-feed'
import type { InboxList, ReleaseFeed } from '../../types/dashboard/inbox'
import { useDisabledFeatures } from '../../lib/feature-switches'
import { inboxNotification } from './inbox-links'
import { dashKeys, invalidateAll } from './keys'

/** How often an open dashboard looks for new notifications (D-B8-9). */
const INBOX_REFRESH_MS = 60_000

/**
 * The viewer's Inbox in this org, with the pills' counts; the rail counts its
 * unread rows. On the API it refreshes every minute and on focus.
 */
export function useNotifications(org: string) {
  const disabled = useDisabledFeatures()
  return useQuery({
    queryKey: dashKeys.notifications(org),
    queryFn: async (): Promise<InboxList> => {
      const page = await dashboardApi.listNotifications(org)
      return {
        list: page.data.map((n) => inboxNotification(org, n, disabled)),
        counts: page.counts,
      }
    },
    ...{
      refetchInterval: INBOX_REFRESH_MS,
      refetchOnWindowFocus: true,
    },
  })
}

/**
 * The rail's unread marker: one count, polled, never the list. The list is
 * fetched by the popover when it opens.
 */
export function useNotificationCount(org: string) {
  return useQuery({
    queryKey: dashKeys.notificationCount(org),
    queryFn: async (): Promise<number> => {
      return (await dashboardApi.getNotificationCount(org)).unread
    },
    ...{
      refetchInterval: INBOX_REFRESH_MS,
      refetchOnWindowFocus: true,
    },
  })
}

export function useMarkNotificationRead(org: string) {
  const client = useQueryClient()
  return useMutation({
    // Following a notification's link marks it read; its dot going is the answer.
    meta: { toast: { success: null, error: 'Couldn’t mark the notification as read' } },
    mutationFn: async (id: string) => {
      await dashboardApi.markNotificationRead(org, id)
    },
    onSuccess: () => invalidateAll(client, [dashKeys.notifications(org)]),
  })
}

export function useMarkAllNotificationsRead(org: string) {
  const client = useQueryClient()
  return useMutation({
    meta: { toast: { success: 'All marked as read', error: 'Couldn’t mark everything as read' } },
    mutationFn: async () => {
      await dashboardApi.markAllNotificationsRead(org)
    },
    onSuccess: () => invalidateAll(client, [dashKeys.notifications(org)]),
  })
}

/**
 * Approve or Decline from the Inbox, by the request's id: the asker's role
 * and their "Asked …" change too.
 */
export function useDecideEditRequest(org: string) {
  const client = useQueryClient()
  return useMutation({
    meta: {
      toast: defineToast<{ id: string; decision: 'approve' | 'decline' }>({
        success: (v) => (v.decision === 'approve' ? 'Request approved' : 'Request declined'),
        error: (v) => `Couldn’t ${v.decision} the request`,
      }),
    },
    mutationFn: async ({ id, decision }: { id: string; decision: 'approve' | 'decline' }) => {
      await dashboardApi.decideAccessRequest(id, decision)
    },
    onSuccess: () =>
      invalidateAll(client, [
        dashKeys.notifications(org),
        dashKeys.inOrg('workspaces', org),
        dashKeys.inOrg('members', org),
        // Org Members' "Has access to" and the access editor.
        dashKeys.orgMembers(org),
        dashKeys.inOrg('requests', org),
        dashKeys.scope(),
      ]),
  })
}

/**
 * What's new, with "New to you" as of the viewer's last visit. The notes
 * ship with the app; on the API only the visit is fetched.
 */
export function useReleases(org: string) {
  const disabled = useDisabledFeatures()
  return useQuery({
    queryKey: dashKeys.releases(org),
    queryFn: async (): Promise<ReleaseFeed> => {
      return releaseFeed(org, RELEASE_NOTES, await dashboardApi.getReleaseVisit(), disabled)
    },
    // The visit changes only when this person closes What's new (or another
    // device does); opening and closing it again reuses the answer.
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  })
}

function useMarkReleasesSeen(org: string) {
  const client = useQueryClient()
  const disabled = useDisabledFeatures()
  return useMutation({
    // Recorded when What's new closes, not clicked (D-AT-2).
    meta: { toast: 'silent' },
    mutationFn: async (seen: string[]): Promise<ReleaseVisit | null> => {
      return dashboardApi.recordReleaseVisit(seen)
    },
    // The write already answers the new visit: rebuild the feed in the cache
    // instead of fetching it back. The rail's dot clears in the same render.
    onSuccess: (visit) => {
      if (visit) {
        client.setQueryData(
          dashKeys.releases(org),
          releaseFeed(org, RELEASE_NOTES, visit, disabled),
        )
        return
      }
      invalidateAll(client, [dashKeys.inAnyOrg('releases')])
    },
  })
}

/**
 * Records the visit — and the notes it showed (`shown`, their ids) — once
 * What's new closes, however it closes: Got it, Escape, a note's link or
 * Back. Until then the sheet keeps its "New to you". Nothing is recorded for
 * notes that never loaded (`shown` undefined).
 */
export function useRecordReleasesVisit(org: string, shown: readonly string[] | undefined) {
  const { mutate } = useMarkReleasesSeen(org)
  const key = shown?.join('\n')
  // Unmounting is the one moment every way of closing shares: a genuine side effect.
  useEffect(() => {
    if (key === undefined) return
    return () => mutate(key ? key.split('\n') : [])
  }, [key, mutate])
}
