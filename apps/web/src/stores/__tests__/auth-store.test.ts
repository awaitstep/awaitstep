import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore, type SessionData } from '../auth-store'

vi.mock('../remembered-inputs', () => ({ reconcileRememberedOwner: vi.fn() }))

const DATA = {
  user: { id: 'u-ama', name: 'Ama', email: 'ama@acme.test' },
  session: { id: 's-1', userId: 'u-ama' },
} as unknown as SessionData

afterEach(() => {
  useAuthStore.getState().clear()
})

describe('useAuthStore.setSession', () => {
  it('leaves the store alone when handed the session it already holds', () => {
    // The authed layout hands its loader data over on every render.
    useAuthStore.getState().setSession(DATA)
    const listener = vi.fn()
    const unsubscribe = useAuthStore.subscribe(listener)
    useAuthStore.getState().setSession(DATA)
    expect(listener).not.toHaveBeenCalled()
    unsubscribe()
  })

  it('takes a new session', () => {
    useAuthStore.getState().setSession(DATA)
    const next = { ...DATA, session: { ...DATA.session, id: 's-2' } } as SessionData
    useAuthStore.getState().setSession(next)
    expect(useAuthStore.getState().session).toBe(next.session)
  })
})
