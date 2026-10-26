import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Each test loads a fresh copy of the db module, the way a page reload does.
async function freshModules() {
  vi.resetModules()
  const db = await import('../db')
  const { mockServer } = await import('../server')
  return { ...db, mockServer }
}

const ama = { scenario: 'none', userId: 'usr_ama' } as const

function memoryStorage(): Storage {
  const items = new Map<string, string>()
  return {
    get length() {
      return items.size
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => void items.delete(key),
    setItem: (key, value) => void items.set(key, value),
  }
}

afterEach(() => vi.unstubAllGlobals())

describe('mock db persistence', () => {
  beforeEach(() => vi.stubGlobal('sessionStorage', memoryStorage()))

  it('keeps a mutation across a reload of the tab', async () => {
    const before = await freshModules()
    await before.mockServer.projects.createProject(ama, 'acme', { name: 'Billing' })

    const after = await freshModules()
    const slugs = (await after.mockServer.projects.listProjects(ama, 'acme')).map((p) => p.slug)
    expect(slugs).toContain('billing')
  })

  it('reseeds on reset and forgets the saved copy', async () => {
    const before = await freshModules()
    await before.mockServer.projects.createProject(ama, 'acme', { name: 'Billing' })
    before.resetMockDb()
    expect(before.getDb().projects.some((p) => p.slug === 'billing')).toBe(false)

    const after = await freshModules()
    expect(after.getDb().projects.some((p) => p.slug === 'billing')).toBe(false)
  })

  it('ignores a saved copy from an older db version', async () => {
    sessionStorage.setItem(
      'awaitstep:dashboard-mock-db',
      JSON.stringify({ version: -1, db: { projects: [] } }),
    )
    const { getDb } = await freshModules()
    expect(getDb().projects.length).toBeGreaterThan(0)
  })
})

describe('mock db without storage', () => {
  it('works from memory when sessionStorage throws', async () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
      removeItem: () => {
        throw new Error('blocked')
      },
    })
    const { mockServer, resetMockDb } = await freshModules()
    await mockServer.projects.createProject(ama, 'acme', { name: 'Billing' })
    expect((await mockServer.projects.listProjects(ama, 'acme')).map((p) => p.slug)).toContain(
      'billing',
    )
    expect(() => resetMockDb()).not.toThrow()
  })
})
