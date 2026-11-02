import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApiAccount } from '@awaitstep/ir'
import { resetMockDb } from '../../../mocks/dashboard/db'
import { useAuthStore } from '../../../stores/auth-store'
import {
  linkErrorMessage,
  useAccount,
  useConnectProvider,
  useDeleteAccount,
  useDisconnectProvider,
  useExportAccount,
  useLeaveOrg,
  useRevokeOtherSessions,
  useRevokeSession,
  useSessions,
  useSignInMethods,
  useUpdateProfile,
} from '../account'
import { errorFieldOf } from '../errors'
import { MockScenarioProvider } from '../scenario-context'
import { DataSourceProvider, type DataSource } from '../source'

// Your account on the API (B10): `/api/account` for reads, leaving, sessions
// and the export, and the photo's own upload; better-auth's client for the
// name, providers and deletion — its hooks on the server hold those rules.

const auth = vi.hoisted(() => ({
  updateUser: vi.fn(),
  getSession: vi.fn(),
  linkSocial: vi.fn(),
  unlinkAccount: vi.fn(),
  deleteUser: vi.fn(),
}))

vi.mock('../../../lib/auth-client', () => ({ authClient: auth }))

const fetchMock = vi.fn()

const ACCOUNT: ApiAccount = {
  person: {
    id: 'u-ama',
    name: 'Ama Mensah',
    email: 'ama@acme.test',
    image: null,
    emailVerified: true,
  },
  orgs: [
    {
      id: 'org-acme',
      slug: 'acme',
      name: 'Acme Inc',
      logo: null,
      role: 'owner',
      projectCount: 3,
      onlyOwner: true,
    },
  ],
  deleteBlockedReason: "You're the only owner of Acme Inc",
  signInMethods: [
    {
      provider: 'github',
      connected: true,
      connectedAt: '2026-09-02T10:00:00.000Z',
      accountId: 'acc-gh',
    },
    { provider: 'email', connected: true, connectedAt: null, accountId: null },
  ],
  providers: { github: true, google: false, emailLink: true },
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  resetMockDb()
  vi.stubGlobal('fetch', fetchMock)
  for (const fn of Object.values(auth)) fn.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
  fetchMock.mockReset()
})

function wrapperFor(source: DataSource) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <DataSourceProvider source={source}>
          <MockScenarioProvider scenario="none" userId="usr_ama">
            {children}
          </MockScenarioProvider>
        </DataSourceProvider>
      </QueryClientProvider>
    )
  }
}

const calls = () => fetchMock.mock.calls.map(([url, init]) => [init?.method ?? 'GET', url])

describe('reads', () => {
  it('turns GET /account into the Profile page’s account, with initials', async () => {
    fetchMock.mockResolvedValueOnce(json(ACCOUNT))
    const { result } = renderHook(() => useAccount(), { wrapper: wrapperFor('api') })
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(calls()).toEqual([['GET', '/api/account']])
    expect(result.current.data).toEqual({
      person: {
        id: 'u-ama',
        name: 'Ama Mensah',
        email: 'ama@acme.test',
        initials: 'AM',
        image: null,
      },
      emailVerified: true,
      orgs: [{ ...ACCOUNT.orgs[0], initial: 'A' }],
      deleteBlockedReason: "You're the only owner of Acme Inc",
    })
  })

  it('reads the sign-in methods, the email link and the address from the same answer', async () => {
    fetchMock.mockResolvedValueOnce(json(ACCOUNT))
    const { result } = renderHook(() => useSignInMethods(), { wrapper: wrapperFor('api') })
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.data).toEqual({
      methods: ACCOUNT.signInMethods,
      providers: { github: true, google: false, emailLink: true },
      email: 'ama@acme.test',
    })
  })

  it('lists sessions from GET /account/sessions', async () => {
    const row = {
      id: 's-1',
      device: 'Chrome on macOS',
      kind: 'desktop',
      ip: null,
      signedInAt: '2026-10-28T00:00:00.000Z',
      activeAt: '2026-10-28T00:00:00.000Z',
      current: true,
    }
    fetchMock.mockResolvedValueOnce(json({ data: [row] }))
    const { result } = renderHook(() => useSessions(), { wrapper: wrapperFor('api') })
    await waitFor(() => expect(result.current.data).toEqual([row]))
  })
})

describe('profile', () => {
  it('saves a name through better-auth and reads the session again for the account menu', async () => {
    auth.updateUser.mockResolvedValue({ data: { status: true }, error: null })
    const session = { user: { id: 'u-ama', name: 'Ama K.' }, session: { id: 's-1' } }
    auth.getSession.mockResolvedValue({ data: session, error: null })
    const { result } = renderHook(() => useUpdateProfile(), { wrapper: wrapperFor('api') })
    await act(() => result.current.mutateAsync({ name: 'Ama K.' }))
    expect(auth.updateUser).toHaveBeenCalledWith({ name: 'Ama K.' })
    expect(useAuthStore.getState().user).toMatchObject({ name: 'Ama K.' })
  })

  it('uploads a photo as its own bytes, and removes one with DELETE', async () => {
    auth.getSession.mockResolvedValue({ data: null, error: null })
    fetchMock.mockResolvedValueOnce(json({ image: '/api/images/img_1' }))
    const { result } = renderHook(() => useUpdateProfile(), { wrapper: wrapperFor('api') })
    const photo = new Blob([new Uint8Array([0x52, 0x49, 0x46, 0x46])], { type: 'image/webp' })
    await act(() => result.current.mutateAsync({ image: photo }))
    const [, init] = fetchMock.mock.calls[0]!
    expect(calls()).toEqual([['PUT', '/api/account/photo']])
    expect(init.body).toBe(photo)
    expect(init.headers).toEqual({ 'Content-Type': 'image/webp' })
    // The photo has its own route: better-auth only takes the name.
    expect(auth.updateUser).not.toHaveBeenCalled()

    fetchMock.mockResolvedValueOnce(json({ image: null }))
    await act(() => result.current.mutateAsync({ image: null }))
    expect(calls()).toEqual([
      ['PUT', '/api/account/photo'],
      ['DELETE', '/api/account/photo'],
    ])
  })

  it('reads the session again when the photo is refused after the name was saved', async () => {
    auth.updateUser.mockResolvedValue({ data: { status: true }, error: null })
    const session = { user: { id: 'u-ama', name: 'Ama K.' }, session: { id: 's-1' } }
    auth.getSession.mockResolvedValue({ data: session, error: null })
    fetchMock.mockResolvedValueOnce(json({ error: 'The photo is empty', field: 'image' }, 400))
    const { result } = renderHook(() => useUpdateProfile(), { wrapper: wrapperFor('api') })
    await result.current
      .mutateAsync({ name: 'Ama K.', image: new Blob([], { type: 'image/png' }) })
      .catch(() => {})
    expect(useAuthStore.getState().user).toMatchObject({ name: 'Ama K.' })
  })

  it('puts a refused photo under the photo', async () => {
    fetchMock.mockResolvedValueOnce(
      json({ error: 'The photo must be a PNG, JPEG, WebP or GIF image', field: 'image' }, 400),
    )
    const { result } = renderHook(() => useUpdateProfile(), { wrapper: wrapperFor('api') })
    const failure = await result.current
      .mutateAsync({ image: new Blob(['<svg/>'], { type: 'image/png' }) })
      .catch((e: unknown) => e)
    expect(failure).toMatchObject({
      message: 'The photo must be a PNG, JPEG, WebP or GIF image',
      status: 400,
    })
    expect(errorFieldOf(failure)).toBe('image')
  })
})

it('reads a photo over the size limit as the API’s 413', async () => {
  fetchMock.mockResolvedValueOnce(json({ error: 'The photo must be at most 512 KB' }, 413))
  const { result } = renderHook(() => useUpdateProfile(), { wrapper: wrapperFor('api') })
  await expect(
    result.current.mutateAsync({ image: new Blob(['x'], { type: 'image/png' }) }),
  ).rejects.toMatchObject({
    message: 'The photo must be at most 512 KB',
    status: 413,
  })
})

describe('writes on /api/account', () => {
  it('leaves an organization by its id', async () => {
    fetchMock.mockResolvedValueOnce(json({ ok: true }))
    const { result } = renderHook(() => useLeaveOrg('acme'), { wrapper: wrapperFor('api') })
    await act(() => result.current.mutateAsync({ id: 'org-bolt', slug: 'bolt' }))
    expect(calls()).toEqual([['POST', '/api/account/orgs/org-bolt/leave']])
  })

  it('says why the only owner can’t leave', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: 'Make someone else an owner first' }, 409))
    const { result } = renderHook(() => useLeaveOrg('acme'), { wrapper: wrapperFor('api') })
    await expect(
      result.current.mutateAsync({ id: 'org-acme', slug: 'acme' }),
    ).rejects.toMatchObject({
      message: 'Make someone else an owner first',
    })
  })

  it('signs out one session, then every other', async () => {
    fetchMock.mockResolvedValueOnce(json({ ok: true })).mockResolvedValueOnce(json({ count: 2 }))
    const one = renderHook(() => useRevokeSession(), { wrapper: wrapperFor('api') })
    await act(() => one.result.current.mutateAsync('s-2'))
    const all = renderHook(() => useRevokeOtherSessions(), { wrapper: wrapperFor('api') })
    await act(() => all.result.current.mutateAsync())
    expect(calls()).toEqual([
      ['DELETE', '/api/account/sessions/s-2'],
      ['DELETE', '/api/account/sessions?scope=others'],
    ])
  })

  it('downloads the export', async () => {
    fetchMock.mockResolvedValueOnce(json({ exportedAt: 'now', memberships: [] }))
    const { result } = renderHook(() => useExportAccount(), { wrapper: wrapperFor('api') })
    const data = await act(() => result.current.mutateAsync())
    expect(data).toMatchObject({ exportedAt: 'now' })
    expect(calls()).toEqual([['POST', '/api/account/export']])
  })
})

describe('providers', () => {
  it('connects through better-auth’s redirect, back to this page', async () => {
    auth.linkSocial.mockResolvedValue({ data: { url: 'https://github.com/…' }, error: null })
    const { result } = renderHook(() => useConnectProvider(), { wrapper: wrapperFor('api') })
    await act(() => result.current.mutateAsync('google'))
    const here = `${window.location.origin}${window.location.pathname}`
    expect(auth.linkSocial).toHaveBeenCalledWith({
      provider: 'google',
      callbackURL: here,
      errorCallbackURL: here,
    })
  })

  it('reads a refused Connect’s ?error= in the page’s words', () => {
    expect(linkErrorMessage(undefined, 'ama@acme.test')).toBeNull()
    expect(linkErrorMessage('email_does_not_match', 'ama@acme.test')).toBe(
      'That account uses another email. Google and GitHub connect only with an account that uses ama@acme.test.',
    )
    expect(linkErrorMessage('account_already_linked_to_different_user', 'x')).toMatch(
      /another AwaitStep account/,
    )
    expect(linkErrorMessage('unable_to_link_account', 'x')).toMatch(/couldn’t connect/)
  })

  it('asks for a fresh sign-in when better-auth says the session is too old to disconnect', async () => {
    auth.unlinkAccount.mockResolvedValueOnce({
      data: null,
      error: { status: 403, code: 'SESSION_NOT_FRESH', message: 'Session is not fresh' },
    })
    const { result } = renderHook(() => useDisconnectProvider(), { wrapper: wrapperFor('api') })
    const github = { ...ACCOUNT.signInMethods[0]!, provider: 'github' as const }
    await expect(result.current.mutateAsync(github)).rejects.toMatchObject({
      message: 'Sign in again to disconnect it: it needs a sign-in from today.',
    })
  })

  it('disconnects by the linked account’s id and says better-auth’s refusal', async () => {
    auth.unlinkAccount.mockResolvedValueOnce({ data: { status: true }, error: null })
    const { result } = renderHook(() => useDisconnectProvider(), { wrapper: wrapperFor('api') })
    const github = { ...ACCOUNT.signInMethods[0]!, provider: 'github' as const }
    await act(() => result.current.mutateAsync(github))
    expect(auth.unlinkAccount).toHaveBeenCalledWith({ accountId: 'acc-gh' })
    auth.unlinkAccount.mockResolvedValueOnce({
      data: null,
      error: { status: 400, message: "You can't unlink your last account" },
    })
    await expect(result.current.mutateAsync(github)).rejects.toMatchObject({
      message: "You can't unlink your last account",
    })
  })
})

describe('delete account', () => {
  it('deletes through better-auth and forgets the session', async () => {
    useAuthStore.getState().setSession({
      user: { id: 'u-ben' },
      session: { id: 's-1' },
    } as Parameters<ReturnType<typeof useAuthStore.getState>['setSession']>[0])
    auth.deleteUser.mockResolvedValue({ data: { success: true }, error: null })
    const { result } = renderHook(() => useDeleteAccount('acme'), { wrapper: wrapperFor('api') })
    await act(() => result.current.mutateAsync('ben@acme.test'))
    expect(auth.deleteUser).toHaveBeenCalledTimes(1)
    expect(useAuthStore.getState().user).toBeNull()
  })

  it('asks for a fresh sign-in when better-auth says the session is too old', async () => {
    auth.deleteUser.mockResolvedValue({
      data: null,
      error: { status: 400, code: 'SESSION_EXPIRED', message: 'Session expired' },
    })
    const { result } = renderHook(() => useDeleteAccount('acme'), { wrapper: wrapperFor('api') })
    await expect(result.current.mutateAsync('ben@acme.test')).rejects.toMatchObject({
      message: expect.stringMatching(/^Sign in again to delete/),
    })
  })

  it('passes on the only-owner refusal', async () => {
    auth.deleteUser.mockResolvedValue({
      data: null,
      error: { status: 409, message: "You're the only owner of Acme Inc" },
    })
    const { result } = renderHook(() => useDeleteAccount('acme'), { wrapper: wrapperFor('api') })
    await expect(result.current.mutateAsync('ama@acme.test')).rejects.toMatchObject({
      message: "You're the only owner of Acme Inc",
      status: 409,
    })
  })
})
