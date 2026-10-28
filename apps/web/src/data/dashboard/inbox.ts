import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { mockServer } from '../../mocks/dashboard/server'
import { dashKeys, invalidateAll, withMockContext } from './keys'
import { useMockContext } from './scenario-context'

/** The viewer's Inbox in this org; the rail counts its unread rows. */
export function useNotifications(org: string) {
  const ctx = useMockContext()
  return useQuery({
    queryKey: withMockContext(dashKeys.notifications(org), ctx),
    queryFn: () => mockServer.inbox.listNotifications(ctx, org),
  })
}

export function useMarkNotificationRead(org: string) {
  const ctx = useMockContext()
  const client = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => mockServer.inbox.markNotificationRead(ctx, org, id),
    onSuccess: () => invalidateAll(client, [dashKeys.notifications(org)]),
  })
}

export function useMarkAllNotificationsRead(org: string) {
  const ctx = useMockContext()
  const client = useQueryClient()
  return useMutation({
    mutationFn: () => mockServer.inbox.markAllNotificationsRead(ctx, org),
    onSuccess: () => invalidateAll(client, [dashKeys.notifications(org)]),
  })
}

/** Approve or Decline from the Inbox: the asker's role and their "Asked …" change too. */
export function useDecideEditRequest(org: string) {
  const ctx = useMockContext()
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: 'approve' | 'decline' }) =>
      mockServer.inbox.decideEditRequest(ctx, org, id, decision),
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

/** What's new, with "New to you" as of the viewer's last visit. */
export function useReleases(org: string) {
  const ctx = useMockContext()
  return useQuery({
    queryKey: withMockContext(dashKeys.releases(org), ctx),
    queryFn: () => mockServer.inbox.listReleases(ctx, org),
  })
}

function useMarkReleasesSeen() {
  const ctx = useMockContext()
  const client = useQueryClient()
  return useMutation({
    mutationFn: () => mockServer.inbox.markReleasesSeen(ctx),
    onSuccess: () => invalidateAll(client, [dashKeys.inAnyOrg('releases')]),
  })
}

/**
 * Records the visit once What's new closes, however it closes: Got it,
 * Escape, a note's link or Back. Until then the sheet keeps its "New to you".
 * Nothing is recorded for notes that never loaded (`loaded`).
 */
export function useRecordReleasesVisit(loaded: boolean) {
  const { mutate } = useMarkReleasesSeen()
  // Unmounting is the one moment every way of closing shares: a genuine side effect.
  useEffect(() => {
    if (!loaded) return
    return () => mutate()
  }, [loaded, mutate])
}
