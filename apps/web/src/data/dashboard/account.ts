import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '../../lib/api-client'
import { authClient } from '../../lib/auth-client'
import { dashboardApi } from '../../lib/dashboard-api'
import { mockServer } from '../../mocks/dashboard/server'
import { useAuthStore } from '../../stores/auth-store'
import type {
  AccountExport,
  ProfileUpdate,
  SignInMethod,
  SignInProvider,
} from '../../types/dashboard/account'
import { toAccount, toSignInMethods } from './api/account'
import { authError, needsFreshSignIn } from './errors'
import { dashKeys, invalidateAll } from './keys'
import { useMockContext } from './scenario-context'
import { useDashKey, useDataSource } from './source'

// Your account: the dummy data, or the API (B10). Name, photo, providers and
// deletion go through better-auth's client — its hooks hold the rules — and
// the rest through `/api/account`.

const EVERYTHING = ['dash'] as const

/** Deleting and disconnecting need a sign-in from the last day (better-auth's fresh session). */
function signInAgain(what: string): ApiError {
  return new ApiError(`Sign in again to ${what}: it needs a sign-in from today.`, 403)
}

export function useAccount() {
  const source = useDataSource()
  const ctx = useMockContext()
  const key = useDashKey()
  return useQuery({
    queryKey: key(dashKeys.account()),
    queryFn: () =>
      source === 'api'
        ? dashboardApi.getAccount().then(toAccount)
        : mockServer.account.getAccount(ctx),
  })
}

/** The session the app holds, read again: the account menu draws the person from it. */
async function refreshSession(): Promise<void> {
  const res = await authClient.getSession({ query: { disableCookieCache: true } })
  if (res.data) useAuthStore.getState().setSession(res.data)
}

/** Name and photo: they show on every page that lists the person, so every query refetches. */
export function useUpdateProfile() {
  const source = useDataSource()
  const ctx = useMockContext()
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (update: ProfileUpdate) => {
      if (source !== 'api') return mockServer.account.updateProfile(ctx, update)
      const res = await authClient.updateUser({
        ...(update.name !== undefined && { name: update.name }),
        ...(update.image !== undefined && { image: update.image }),
      })
      if (res.error) {
        throw authError(res.error, 'Could not save your profile', update.name ? 'name' : 'image')
      }
      await refreshSession()
    },
    onSuccess: () => invalidateAll(client, [EVERYTHING]),
  })
}

/**
 * Leave an organization. Leaving the one in the URL marks its pages stale
 * without refetching them, since the page leaves for /dashboard.
 */
export function useLeaveOrg(currentOrg: string) {
  const source = useDataSource()
  const ctx = useMockContext()
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (org: { id: string; slug: string }) => {
      if (source !== 'api') return mockServer.account.leaveOrg(ctx, org.slug)
      await dashboardApi.leaveOrg(org.id)
    },
    onSuccess: (_, org) =>
      invalidateAll(client, [EVERYTHING], org.slug === currentOrg ? { org: org.slug } : undefined),
  })
}

/** Delete account: every membership goes, the org in the URL with them. */
export function useDeleteAccount(currentOrg: string) {
  const source = useDataSource()
  const ctx = useMockContext()
  const client = useQueryClient()
  return useMutation({
    // The confirm dialog holds Delete until the email is typed; the dummy server checks it again.
    mutationFn: async (confirmEmail: string) => {
      if (source !== 'api') return mockServer.account.deleteAccount(ctx, confirmEmail)
      const res = await authClient.deleteUser({})
      if (res.error) {
        if (needsFreshSignIn(res.error)) throw signInAgain('delete your account')
        throw authError(res.error, 'Could not delete your account')
      }
      useAuthStore.getState().clear()
    },
    onSuccess: () => invalidateAll(client, [EVERYTHING], { org: currentOrg }),
  })
}

/** Download JSON's content, read when the button is pressed. */
export function useExportAccount() {
  const source = useDataSource()
  const ctx = useMockContext()
  return useMutation({
    mutationFn: (): Promise<AccountExport> =>
      source === 'api' ? dashboardApi.exportAccount() : mockServer.account.exportAccount(ctx),
  })
}

export function useSignInMethods() {
  const source = useDataSource()
  const ctx = useMockContext()
  const key = useDashKey()
  return useQuery({
    queryKey: key(dashKeys.signInMethods()),
    queryFn: () =>
      source === 'api'
        ? dashboardApi.getAccount().then(toSignInMethods)
        : mockServer.account.listSignInMethods(ctx),
  })
}

/**
 * Connect: on the API, better-auth sends the browser to the provider and back
 * here; it joins the account only when the provider's verified email is this
 * one. A refusal comes back as `?error=<code>` on this page
 * (`linkErrorMessage`). The dummy data links it at once.
 */
export function useConnectProvider() {
  const source = useDataSource()
  const ctx = useMockContext()
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (provider: SignInProvider) => {
      if (source !== 'api') return mockServer.account.setSignInMethod(ctx, provider, true)
      const here = `${window.location.origin}${window.location.pathname}`
      const res = await authClient.linkSocial({
        provider,
        callbackURL: here,
        errorCallbackURL: here,
      })
      if (res.error) throw authError(res.error, 'Could not connect the account')
    },
    onSuccess: () => invalidateAll(client, [dashKeys.signInMethods(), dashKeys.account()]),
  })
}

export function useDisconnectProvider() {
  const source = useDataSource()
  const ctx = useMockContext()
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (method: SignInMethod & { provider: SignInProvider }) => {
      if (source !== 'api') return mockServer.account.setSignInMethod(ctx, method.provider, false)
      if (!method.accountId) throw new ApiError('That account is not connected', 400)
      const res = await authClient.unlinkAccount({ accountId: method.accountId })
      if (res.error) {
        if (needsFreshSignIn(res.error)) throw signInAgain('disconnect it')
        throw authError(res.error, 'Could not disconnect the account')
      }
    },
    onSuccess: () => invalidateAll(client, [dashKeys.signInMethods(), dashKeys.account()]),
  })
}

export function useSessions() {
  const source = useDataSource()
  const ctx = useMockContext()
  const key = useDashKey()
  return useQuery({
    queryKey: key(dashKeys.sessions()),
    queryFn: () =>
      source === 'api'
        ? dashboardApi.listAccountSessions().then((res) => res.data)
        : mockServer.account.listSessions(ctx),
  })
}

export function useRevokeSession() {
  const source = useDataSource()
  const ctx = useMockContext()
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (sessionId: string) => {
      if (source !== 'api') return mockServer.account.revokeSession(ctx, sessionId)
      await dashboardApi.revokeAccountSession(sessionId)
    },
    onSuccess: () => invalidateAll(client, [dashKeys.sessions()]),
  })
}

export function useRevokeOtherSessions() {
  const source = useDataSource()
  const ctx = useMockContext()
  const client = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      if (source !== 'api') return mockServer.account.revokeOtherSessions(ctx)
      await dashboardApi.revokeOtherAccountSessions()
    },
    onSuccess: () => invalidateAll(client, [dashKeys.sessions()]),
  })
}

/** What a refused Connect's `?error=` means, in the page's words; null for none. */
export function linkErrorMessage(code: string | undefined, email: string): string | null {
  if (!code) return null
  if (code === 'email_does_not_match') {
    return `That account uses another email. Google and GitHub connect only with an account that uses ${email}.`
  }
  if (code === 'account_already_linked_to_different_user') {
    return 'That account already signs in to another AwaitStep account.'
  }
  return 'We couldn’t connect that account. Try again.'
}
