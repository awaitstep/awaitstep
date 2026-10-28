import { createAuthClient } from 'better-auth/react'
import { magicLinkClient, organizationClient } from 'better-auth/client/plugins'
import { signInPath } from './auth-redirect'
import { useAuthStore } from '../stores/auth-store'

export const authClient = createAuthClient({
  baseURL: '',
  plugins: [magicLinkClient(), organizationClient()],
})

export const { signIn, signOut } = authClient

/** Signs out, then shows sign-in; `returnTo` (an app path) is where signing in again goes. */
export async function handleSignOut(returnTo?: string) {
  await signOut()
  useAuthStore.getState().clear()
  const { useOrgStore } = await import('../stores/org-store')
  useOrgStore.getState().clear()
  window.location.href = signInPath(returnTo)
}
