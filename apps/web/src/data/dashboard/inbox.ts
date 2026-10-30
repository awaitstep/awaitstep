import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { RELEASE_NOTES } from '../../content/releases'
import { dashboardApi } from '../../lib/dashboard-api'
import { releaseFeed } from '../../lib/release-feed'
import { mockServer } from '../../mocks/dashboard/server'
import type { InboxList, ReleaseFeed } from '../../types/dashboard/inbox'
import { inboxCounts } from '../../components/inbox/inbox-filter'
import { inboxNotification } from './inbox-links'
import { dashKeys, invalidateAll } from './keys'
import { useMockContext } from './scenario-context'
import { useDashKey, useDataSource } from './source'

/** How often an open dashboard looks for new notifications (D-B8-9). */
const INBOX_REFRESH_MS = 60_000

/**
 * The viewer's Inbox in this org, with the pills' counts; the rail counts its
 * unread rows. On the API it refreshes every minute and on focus.
 */
export function useNotifications(org: string) {
  const source = useDataSource()
  const ctx = useMockContext()
  const key = useDashKey()
  return useQuery({
    queryKey: key(dashKeys.notifications(org)),
    queryFn: async (): Promise<InboxList> => {
      if (source === 'api') {
        const page = await dashboardApi.listNotifications(org)
        return { list: page.data.map((n) => inboxNotification(org, n)), counts: page.counts }
      }
      const list = await mockServer.inbox.listNotifications(ctx, org)
      return { list, counts: inboxCounts(list) }
    },
    ...(source === 'api' && {
      refetchInterval: INBOX_REFRESH_MS,
      refetchOnWindowFocus: true,
    }),
  })
}

export function useMarkNotificationRead(org: string) {
  const source = useDataSource()
  const ctx = useMockContext()
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      if (source === 'api') await dashboardApi.markNotificationRead(org, id)
      else await mockServer.inbox.markNotificationRead(ctx, org, id)
    },
    onSuccess: () => invalidateAll(client, [dashKeys.notifications(org)]),
  })
}

export function useMarkAllNotificationsRead(org: string) {
  const source = useDataSource()
  const ctx = useMockContext()
  const client = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      if (source === 'api') await dashboardApi.markAllNotificationsRead(org)
      else await mockServer.inbox.markAllNotificationsRead(ctx, org)
    },
    onSuccess: () => invalidateAll(client, [dashKeys.notifications(org)]),
  })
}

/**
 * Approve or Decline from the Inbox, by the request's id: the asker's role
 * and their "Asked …" change too.
 */
export function useDecideEditRequest(org: string) {
  const source = useDataSource()
  const ctx = useMockContext()
  const client = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, decision }: { id: string; decision: 'approve' | 'decline' }) => {
      if (source === 'api') await dashboardApi.decideAccessRequest(id, decision)
      else await mockServer.inbox.decideEditRequest(ctx, org, id, decision)
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
  const source = useDataSource()
  const ctx = useMockContext()
  const key = useDashKey()
  return useQuery({
    queryKey: key(dashKeys.releases(org)),
    queryFn: async (): Promise<ReleaseFeed> => {
      if (source === 'mock') return mockServer.inbox.listReleases(ctx, org)
      return releaseFeed(org, RELEASE_NOTES, await dashboardApi.getReleaseVisit())
    },
  })
}

function useMarkReleasesSeen() {
  const source = useDataSource()
  const ctx = useMockContext()
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (seen: string[]) => {
      if (source === 'api') await dashboardApi.recordReleaseVisit(seen)
      else await mockServer.inbox.markReleasesSeen(ctx, seen)
    },
    onSuccess: () => invalidateAll(client, [dashKeys.inAnyOrg('releases')]),
  })
}

/**
 * Records the visit — and the notes it showed (`shown`, their ids) — once
 * What's new closes, however it closes: Got it, Escape, a note's link or
 * Back. Until then the sheet keeps its "New to you". Nothing is recorded for
 * notes that never loaded (`shown` undefined).
 */
export function useRecordReleasesVisit(shown: readonly string[] | undefined) {
  const { mutate } = useMarkReleasesSeen()
  const key = shown?.join('\n')
  // Unmounting is the one moment every way of closing shares: a genuine side effect.
  useEffect(() => {
    if (key === undefined) return
    return () => mutate(key ? key.split('\n') : [])
  }, [key, mutate])
}
