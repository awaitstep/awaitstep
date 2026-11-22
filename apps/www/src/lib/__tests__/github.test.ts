import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  vi.resetModules()
})

async function load() {
  return import('../github')
}

function stubFetch(...responses: Array<Response | Error>) {
  const fetch = vi.fn(async () => {
    const next = responses.shift()
    if (!next || next instanceof Error) throw next ?? new Error('no more responses')
    return next
  })
  vi.stubGlobal('fetch', fetch)
  return fetch
}

const stars = (n: number) => new Response(JSON.stringify({ stargazers_count: n }), { status: 200 })

describe('formatStars', () => {
  it('shows counts under a thousand as they are', async () => {
    const { formatStars } = await load()
    expect(formatStars(44)).toBe('44')
    expect(formatStars(999)).toBe('999')
  })

  it('shows thousands with one decimal, dropping a trailing .0', async () => {
    const { formatStars } = await load()
    expect(formatStars(1000)).toBe('1k')
    expect(formatStars(1234)).toBe('1.2k')
    expect(formatStars(25_000)).toBe('25k')
  })
})

describe('starCount', () => {
  it('asks GitHub once and reuses a found count', async () => {
    const fetch = stubFetch(stars(44))
    const { starCount } = await load()
    expect(await starCount()).toBe('44')
    expect(await starCount()).toBe('44')
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('shares one request between pages asking at the same time', async () => {
    const fetch = stubFetch(stars(7))
    const { starCount } = await load()
    expect(await Promise.all([starCount(), starCount(), starCount()])).toEqual(['7', '7', '7'])
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('returns null when GitHub refuses, and waits before asking again', async () => {
    vi.useFakeTimers()
    const fetch = stubFetch(new Response('rate limited', { status: 403 }), stars(12))
    const { starCount } = await load()
    expect(await starCount()).toBeNull()
    expect(await starCount()).toBeNull()
    expect(fetch).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(5 * 60 * 1000)
    expect(await starCount()).toBe('12')
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('returns null when the request fails or the answer has no count', async () => {
    vi.useFakeTimers()
    stubFetch(new Error('offline'), new Response('{}', { status: 200 }))
    const { starCount } = await load()
    expect(await starCount()).toBeNull()
    vi.advanceTimersByTime(5 * 60 * 1000)
    expect(await starCount()).toBeNull()
  })
})
