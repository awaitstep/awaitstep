import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiPath, pathSegment } from '../api-path'
import { dashboardApi } from '../dashboard-api'

// An id from the URL arrives decoded: `%3F` is `?`, `%2F` is `/`, `%23` is `#`.
const HOSTILE = '../projects/p1?org=other#'

let fetchSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'))
})

afterEach(() => {
  vi.restoreAllMocks()
})

function requested(): string {
  return String(fetchSpy.mock.calls[0]![0])
}

describe('apiPath', () => {
  it('encodes each value as one segment and leaves the literal parts alone', () => {
    expect(apiPath`/workspaces/${'a/b'}/members/${'c?d#'}`).toBe(
      '/workspaces/a%2Fb/members/c%3Fd%23',
    )
  })

  it('refuses a dot segment, which the URL would collapse into another route', () => {
    expect(() => pathSegment('..')).toThrow()
    expect(() => pathSegment('.')).toThrow()
    // An empty one would drop its segment: `/workflows/` is the list.
    expect(() => pathSegment('')).toThrow()
    expect(() => apiPath`/invitations/${'..'}/accept`).toThrow()
    // Dots inside a value stay in its segment.
    expect(pathSegment('a..b')).toBe('a..b')
  })

  it('returns a path with no values unchanged', () => {
    expect(apiPath`/scope`).toBe('/scope')
  })
})

describe('dashboard API paths built from ids', () => {
  it('keeps every id one path segment, so it can’t reach another route', async () => {
    await dashboardApi.removeWorkspaceMember(HOSTILE, 'u/1')
    const url = requested()
    expect(url).toContain(`/workspaces/${encodeURIComponent(HOSTILE)}/members/u%2F1`)
    expect(url).not.toContain('#')
  })

  it('keeps the query string after an encoded id', async () => {
    await dashboardApi.deleteProject('acme', 'a/b')
    expect(requested()).toMatch(/\/projects\/a%2Fb\?org=acme$/)
  })

  it('sends nothing for an invite token that is a dot segment', () => {
    expect(() => dashboardApi.acceptInvite('..')).toThrow()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('builds no path from a bare template literal', () => {
    const source = readFileSync(new URL('../dashboard-api.ts', import.meta.url), 'utf8')
    const code = source
      .split('\n')
      .filter((line) => !/^\s*(\*|\/\/|\/\*\*)/.test(line))
      .join('\n')
    expect(code.match(/(?<!apiPath)`\/[^`]*\$\{/g) ?? []).toEqual([])
  })
})
