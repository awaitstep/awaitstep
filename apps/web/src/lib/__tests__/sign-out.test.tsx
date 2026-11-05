import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
const signOut = vi.hoisted(() => vi.fn())
vi.mock('sonner', () => ({ toast }))
vi.mock('better-auth/react', () => ({ createAuthClient: () => ({ signOut, signIn: vi.fn() }) }))

import { actionToast, CARRIED_TOAST_MAX_AGE_MS, showCarriedToast } from '../action-toast'
import { handleSignOut } from '../auth-client'
import { useAuthStore } from '../../stores/auth-store'
import { useTestSessionStore } from '../../stores/test-session-store'
import { useQuickTestStore } from '../../stores/quick-test-store'

const startAt = 'http://localhost:3000/account/sessions'

beforeEach(() => {
  toast.success.mockClear()
  toast.error.mockClear()
  sessionStorage.clear()
  window.history.replaceState(null, '', startAt)
})

afterEach(() => vi.unstubAllGlobals())

describe('handleSignOut', () => {
  it('keeps you signed in, on the page, with a toast when the call fails', async () => {
    signOut.mockResolvedValueOnce({ data: null, error: { message: 'boom', status: 500 } })
    const clear = vi.spyOn(useAuthStore.getState(), 'clear')
    await handleSignOut()
    expect(toast.error).toHaveBeenCalledWith(
      'Couldn’t sign you out',
      expect.objectContaining({ duration: 6000 }),
    )
    expect(clear).not.toHaveBeenCalled()
    expect(window.location.href).toBe(startAt)
    showCarriedToast()
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('forgets remembered trigger payloads and Quick test arguments', async () => {
    useTestSessionStore.getState().setPayload('wf', '{"token":"secret"}')
    useQuickTestStore.getState().setField('k', 'inputs', '{"token":"secret"}')
    expect(localStorage.getItem('awaitstep-test-session')).toContain('secret')
    signOut.mockResolvedValueOnce({ data: { success: true }, error: null })
    vi.stubGlobal('location', { href: startAt })
    await handleSignOut()
    expect(localStorage.getItem('awaitstep-test-session')).toBeNull()
    expect(localStorage.getItem('awaitstep-quick-test')).toBeNull()
  })

  it('treats a network failure the same way, without an unhandled rejection', async () => {
    signOut.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await expect(handleSignOut()).resolves.toBeUndefined()
    expect(toast.error).toHaveBeenCalledWith(
      'Couldn’t sign you out',
      expect.objectContaining({ duration: 6000 }),
    )
  })

  it('leaves "Signed out" for the sign-in page, shown once', async () => {
    signOut.mockResolvedValueOnce({ data: { success: true }, error: null })
    const location = { href: startAt }
    vi.stubGlobal('location', location)
    await handleSignOut()
    expect(location.href).toBe('/sign-in')
    expect(toast.success).not.toHaveBeenCalled()
    showCarriedToast()
    showCarriedToast()
    expect(toast.success).toHaveBeenCalledTimes(1)
    expect(toast.success).toHaveBeenCalledWith('Signed out', expect.any(Object))
  })

  it('drops a carried line whose reload never came', () => {
    actionToast.successAfterReload('Organization created', 1_000)
    showCarriedToast(1_000 + CARRIED_TOAST_MAX_AGE_MS + 1)
    expect(toast.success).not.toHaveBeenCalled()
    actionToast.successAfterReload('Organization created', 1_000)
    showCarriedToast(1_500)
    expect(toast.success).toHaveBeenCalledWith('Organization created', expect.any(Object))
  })
})
