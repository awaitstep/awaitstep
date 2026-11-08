import {
  browserDraftStorage,
  clearAllDrafts,
  suspendDraftWrites,
} from '../../lib/ide/draft-persistence'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '../../lib/api-client'
import type { ApiAccount } from '@awaitstep/ir'
import { authClient } from '../../lib/auth-client'
import { dashboardApi } from '../../lib/dashboard-api'
import { mockServer } from '../../mocks/dashboard/server'
import { useAuthStore } from '../../stores/auth-store'
import { announceSignOut } from '../../lib/auth-signal'
import { forgetRememberedInputs } from '../../stores/remembered-inputs'
import type {
  Account,
  AccountExport,
  ProfileUpdate,
  SignInMethod,
  SignInMethods,
  SignInProvider,
} from '../../types/dashboard/account'
import { toAccount, toSignInMethods } from './api/account'
import { authError, needsFreshSignIn } from './errors'
import { dashKeys, invalidateAll } from './keys'
import { useMockContext } from './scenario-context'
import type { MockContext } from '../../mocks/dashboard/scenario'
import { readAsDataUrl } from '../../lib/read-file'
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
  return useQuery<ApiAccount | Account, Error, Account>({
    queryKey: key(dashKeys.account()),
    queryFn: () =>
      source === 'api' ? dashboardApi.getAccount() : mockServer.account.getAccount(ctx),
    select: (row) => (source === 'api' ? toAccount(row as ApiAccount) : (row as Account)),
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
    meta: { toast: { success: 'Profile saved', error: 'Couldn’t save your profile' } },
    mutationFn: async (update: ProfileUpdate) => {
      if (source !== 'api') return updateMockProfile(ctx, update)
      try {
        if (update.name !== undefined) {
          const res = await authClient.updateUser({ name: update.name })
          if (res.error) throw authError(res.error, 'Could not save your profile', 'name')
        }
        if (update.image) await dashboardApi.uploadPhoto(update.image)
        else if (update.image === null) await dashboardApi.removePhoto()
      } finally {
        // A name saved before a refused photo still shows. A failed re-read
        // never hides the save's own answer.
        await refreshSession().catch(() => {})
      }
    },
    // Settled, not succeeded: a step may have landed before another failed.
    onSettled: () => invalidateAll(client, [EVERYTHING]),
  })
}

async function updateMockProfile(ctx: MockContext, update: ProfileUpdate): Promise<void> {
  if (update.name !== undefined) await mockServer.account.updateProfile(ctx, { name: update.name })
  if (update.image !== undefined) {
    await mockServer.account.setPhoto(ctx, update.image && (await readAsDataUrl(update.image)))
  }
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
    meta: {
      toast: { success: 'You left the organization', error: 'Couldn’t leave the organization' },
    },
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
    meta: { toast: { success: 'Account deleted', error: 'Couldn’t delete your account' } },
    // The confirm dialog holds Delete until the email is typed; the dummy server checks it again.
    mutationFn: async (confirmEmail: string) => {
      if (source !== 'api') return mockServer.account.deleteAccount(ctx, confirmEmail)
      const res = await authClient.deleteUser({})
      if (res.error) {
        if (needsFreshSignIn(res.error)) throw signInAgain('delete your account')
        throw authError(res.error, 'Could not delete your account')
      }
      suspendDraftWrites()
      await clearAllDrafts(browserDraftStorage).catch(() => undefined)
      forgetRememberedInputs()
      announceSignOut()
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
    meta: { toast: { success: 'Your data is downloading', error: 'Couldn’t export your data' } },
    mutationFn: (): Promise<AccountExport> =>
      source === 'api' ? dashboardApi.exportAccount() : mockServer.account.exportAccount(ctx),
  })
}

export function useSignInMethods() {
  const source = useDataSource()
  const ctx = useMockContext()
  const key = useDashKey()
  // The API answers both from `GET /account`: one request, two `select`s.
  return useQuery<ApiAccount | SignInMethods, Error, SignInMethods>({
    queryKey: source === 'api' ? key(dashKeys.account()) : key(dashKeys.signInMethods()),
    queryFn: () =>
      source === 'api' ? dashboardApi.getAccount() : mockServer.account.listSignInMethods(ctx),
    select: (row) =>
      source === 'api' ? toSignInMethods(row as ApiAccount) : (row as SignInMethods),
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
    // On the API the browser leaves for the provider; a refusal comes back on this page.
    meta: {
      toast: {
        success: source === 'api' ? null : 'Account connected',
        error: 'Couldn’t connect the account',
      },
    },
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
    meta: { toast: { success: 'Account disconnected', error: 'Couldn’t disconnect the account' } },
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
    meta: { toast: { success: 'Session signed out', error: 'Couldn’t sign out that session' } },
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
    meta: {
      toast: {
        success: 'Other sessions signed out',
        error: 'Couldn’t sign out the other sessions',
      },
    },
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
