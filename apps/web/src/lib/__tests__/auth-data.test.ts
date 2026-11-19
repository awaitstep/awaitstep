import { describe, expect, it, vi } from 'vitest'
import { loadAuthData } from '../auth-data'

const SESSION = { session: { id: 's1' }, user: { id: 'u1' } }

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status })
}

function api(routes: Record<string, () => Promise<Response>>) {
  return vi.fn((path: string) => routes[path]?.() ?? Promise.resolve(json({}, 404)))
}

describe('loadAuthData', () => {
  it('returns the session, organizations and the instance’s features', async () => {
    const fetch = api({
      '/api/auth/get-session': async () => json(SESSION),
      '/api/instance': async () => json({ features: ['test-ext'] }),
      '/api/auth/organization/list': async () => json([{ id: 'o1' }]),
    })
    expect(await loadAuthData(fetch, 'c=1')).toEqual({
      sessionData: SESSION,
      organizations: [{ id: 'o1' }],
      features: ['test-ext'],
    })
    expect(fetch).toHaveBeenCalledWith('/api/auth/get-session', { headers: { cookie: 'c=1' } })
  })

  it('asks for the instance beside the session, not after it', async () => {
    let answerSession!: (res: Response) => void
    const fetch = api({
      '/api/auth/get-session': () => new Promise((resolve) => (answerSession = resolve)),
      '/api/instance': async () => json({ features: [] }),
      '/api/auth/organization/list': async () => json([]),
    })
    const loading = loadAuthData(fetch, 'c=1')
    expect(fetch.mock.calls.map(([path]) => path)).toEqual([
      '/api/auth/get-session',
      '/api/instance',
    ])
    answerSession(json(SESSION))
    await loading
  })

  it('loads with no features when the instance answer fails', async () => {
    const fetch = api({
      '/api/auth/get-session': async () => json(SESSION),
      '/api/instance': async () => json({ error: 'boom' }, 500),
      '/api/auth/organization/list': async () => json([]),
    })
    expect((await loadAuthData(fetch, 'c=1'))?.features).toEqual([])
  })

  it('is null without a session', async () => {
    const signedOut = api({
      '/api/auth/get-session': async () => json(null),
      '/api/instance': async () => json({ features: [] }),
    })
    expect(await loadAuthData(signedOut, 'c=1')).toBeNull()
    const refused = api({
      '/api/auth/get-session': async () => json({ error: 'x' }, 401),
      '/api/instance': async () => json({ features: [] }),
    })
    expect(await loadAuthData(refused, 'c=1')).toBeNull()
  })
})
