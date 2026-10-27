import { describe, expect, it } from 'vitest'
import { recentProjects, recentWorkspaces, rememberWorkspace } from '../scope-memory'

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  }
}

const throwing = {
  getItem: (): string | null => {
    throw new Error('blocked')
  },
  setItem: () => {
    throw new Error('blocked')
  },
}

describe('scope memory', () => {
  it('lists workspaces per project and projects per org, most recent first', () => {
    const storage = memoryStorage()
    rememberWorkspace('acme', 'project-101', 'sales', storage)
    rememberWorkspace('acme', 'project-101', 'it', storage)
    rememberWorkspace('acme', 'marketing-site', 'default', storage)
    expect(recentWorkspaces('acme', 'project-101', storage)).toEqual(['it', 'sales'])
    expect(recentWorkspaces('acme', 'marketing-site', storage)).toEqual(['default'])
    expect(recentProjects('acme', storage)).toEqual(['marketing-site', 'project-101'])
    expect(recentWorkspaces('globex', 'project-101', storage)).toEqual([])
  })

  it('keeps a stale slug from pushing out the workspace that did open', () => {
    const storage = memoryStorage()
    rememberWorkspace('acme', 'project-101', 'sales', storage)
    rememberWorkspace('acme', 'project-101', 'old-ws', storage)
    expect(recentWorkspaces('acme', 'project-101', storage)).toEqual(['old-ws', 'sales'])
  })

  it('moves a revisited slug to the front without repeating it, and keeps five', () => {
    const storage = memoryStorage()
    for (const slug of ['a', 'b', 'c', 'd', 'e', 'f', 'b']) {
      rememberWorkspace('acme', 'p', slug, storage)
    }
    expect(recentWorkspaces('acme', 'p', storage)).toEqual(['b', 'f', 'e', 'd', 'c'])
  })

  it('reads damaged or blocked storage as nothing remembered', () => {
    const damaged = memoryStorage({
      'awaitstep:dashboard:recent-workspaces:acme/p': '{oops',
      'awaitstep:dashboard:recent-projects:acme': '[1, "p"]',
    })
    expect(recentWorkspaces('acme', 'p', damaged)).toEqual([])
    expect(recentProjects('acme', damaged)).toEqual(['p'])
    expect(() => rememberWorkspace('acme', 'project-101', 'it', throwing)).not.toThrow()
    expect(recentWorkspaces('acme', 'project-101', throwing)).toEqual([])
    expect(recentProjects('acme', null)).toEqual([])
  })
})
