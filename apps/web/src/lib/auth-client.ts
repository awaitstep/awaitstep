import { createAuthClient } from 'better-auth/react'
import { magicLinkClient } from 'better-auth/client/plugins'
import { useAuthStore } from '../stores/auth-store'

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:3001',
  plugins: [magicLinkClient()],
})

export const { signIn, signOut } = authClient

export async function handleSignOut() {
  await signOut()
  useAuthStore.getState().clear()
  window.location.href = '/sign-in'
}
