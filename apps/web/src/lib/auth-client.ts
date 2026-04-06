import { createAuthClient } from 'better-auth/react'
import { magicLinkClient, organizationClient } from 'better-auth/client/plugins'
import { useAuthStore } from '../stores/auth-store'

export const authClient = createAuthClient({
  baseURL: '',
  plugins: [magicLinkClient(), organizationClient()],
})

export const { signIn, signOut } = authClient

export async function handleSignOut() {
  await signOut()
  useAuthStore.getState().clear()
  const { useOrgStore } = await import('../stores/org-store')
  useOrgStore.getState().clear()
  window.location.href = '/sign-in'
}
