import { createAuthClient } from 'better-auth/react'
import { ApiError } from './api-client'
import { magicLinkClient, organizationClient } from 'better-auth/client/plugins'
import { actionToast, failureLine } from './action-toast'
import { signInPath } from './auth-redirect'
import { useAuthStore } from '../stores/auth-store'

export const authClient = createAuthClient({
  baseURL: '',
  plugins: [magicLinkClient(), organizationClient()],
})

export const { signIn, signOut } = authClient

/**
 * Signs out, then shows sign-in with "Signed out"; `returnTo` (an app path) is
 * where signing in again goes. When the call fails you stay signed in, on the
 * page, with "Couldn't sign you out".
 */
export async function handleSignOut(returnTo?: string) {
  const res = await signOut().catch(() => null)
  if (!res || res.error) {
    const refusal = res?.error && new ApiError(res.error.message ?? '', res.error.status ?? 500)
    actionToast.error(failureLine(refusal, 'Couldn’t sign you out'))
    return
  }
  actionToast.successAfterReload('Signed out')
  useAuthStore.getState().clear()
  const { useOrgStore } = await import('../stores/org-store')
  useOrgStore.getState().clear()
  window.location.href = signInPath(returnTo)
}
