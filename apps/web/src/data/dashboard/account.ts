import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { mockServer } from '../../mocks/dashboard/server'
import type { ProfileUpdate, SignInProvider } from '../../types/dashboard/account'
import { dashKeys, invalidateAll, withMockContext } from './keys'
import { useMockContext } from './scenario-context'

// Your account (P10), on dummy data until B10.

const EVERYTHING = ['dash'] as const

export function useAccount() {
  const ctx = useMockContext()
  return useQuery({
    queryKey: withMockContext(dashKeys.account(), ctx),
    queryFn: () => mockServer.account.getAccount(ctx),
  })
}

/** Name and photo: they show on every page that lists the person, so every query refetches. */
export function useUpdateProfile() {
  const ctx = useMockContext()
  const client = useQueryClient()
  return useMutation({
    mutationFn: (update: ProfileUpdate) => mockServer.account.updateProfile(ctx, update),
    onSuccess: () => invalidateAll(client, [EVERYTHING]),
  })
}

export function useRequestEmailChange() {
  const ctx = useMockContext()
  const client = useQueryClient()
  return useMutation({
    mutationFn: (email: string) => mockServer.account.requestEmailChange(ctx, email),
    onSuccess: () => invalidateAll(client, [dashKeys.account()]),
  })
}

/**
 * Leave an organization. Leaving the one in the URL marks its pages stale
 * without refetching them, since the page leaves for Choose an organization.
 */
export function useLeaveOrg(currentOrg: string) {
  const ctx = useMockContext()
  const client = useQueryClient()
  return useMutation({
    mutationFn: (orgSlug: string) => mockServer.account.leaveOrg(ctx, orgSlug),
    onSuccess: (_, orgSlug) =>
      invalidateAll(client, [EVERYTHING], orgSlug === currentOrg ? { org: orgSlug } : undefined),
  })
}

/** Delete account: every membership goes, the org in the URL with them. */
export function useDeleteAccount(currentOrg: string) {
  const ctx = useMockContext()
  const client = useQueryClient()
  return useMutation({
    mutationFn: (confirmEmail: string) => mockServer.account.deleteAccount(ctx, confirmEmail),
    onSuccess: () => invalidateAll(client, [EVERYTHING], { org: currentOrg }),
  })
}

/** Download JSON's content, read when the button is pressed. */
export function useExportAccount() {
  const ctx = useMockContext()
  return useMutation({ mutationFn: () => mockServer.account.exportAccount(ctx) })
}

export function useSignInMethods() {
  const ctx = useMockContext()
  return useQuery({
    queryKey: withMockContext(dashKeys.signInMethods(), ctx),
    queryFn: () => mockServer.account.listSignInMethods(ctx),
  })
}

export function useSetSignInMethod() {
  const ctx = useMockContext()
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ provider, connected }: { provider: SignInProvider; connected: boolean }) =>
      mockServer.account.setSignInMethod(ctx, provider, connected),
    onSuccess: () => invalidateAll(client, [dashKeys.signInMethods()]),
  })
}

export function useSessions() {
  const ctx = useMockContext()
  return useQuery({
    queryKey: withMockContext(dashKeys.sessions(), ctx),
    queryFn: () => mockServer.account.listSessions(ctx),
  })
}

export function useRevokeSession() {
  const ctx = useMockContext()
  const client = useQueryClient()
  return useMutation({
    mutationFn: (sessionId: string) => mockServer.account.revokeSession(ctx, sessionId),
    onSuccess: () => invalidateAll(client, [dashKeys.sessions()]),
  })
}

export function useRevokeOtherSessions() {
  const ctx = useMockContext()
  const client = useQueryClient()
  return useMutation({
    mutationFn: () => mockServer.account.revokeOtherSessions(ctx),
    onSuccess: () => invalidateAll(client, [dashKeys.sessions()]),
  })
}
