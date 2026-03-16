import { create } from 'zustand'
import type { authClient } from '../lib/auth-client'

type SessionResponse = Awaited<ReturnType<typeof authClient.getSession>>
type SessionResult = Extract<SessionResponse, { data: NonNullable<SessionResponse['data']> }>
export type SessionData = NonNullable<SessionResult['data']>

type AuthUser = SessionData['user']
type AuthSession = SessionData['session']

interface AuthState {
  user: AuthUser | null
  session: AuthSession | null
  setSession: (data: SessionData | null) => void
  clear: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  session: null,
  setSession: (data) =>
    set(data ? { user: data.user, session: data.session } : { user: null, session: null }),
  clear: () => set({ user: null, session: null }),
}))
