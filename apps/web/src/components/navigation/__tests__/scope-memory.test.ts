import { describe, expect, it } from 'vitest'
import {
  orgOpenedAt,
  recentOrgs,
  recentProjects,
  recentWorkspaces,
  rememberOrg,
  rememberWorkspace,
} from '../scope-memory'

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

  it('remembers when each org was opened, and forgets the time once the org drops off the list', () => {
    const storage = memoryStorage()
    const at = (minute: number) => new Date(Date.UTC(2026, 9, 31, 9, minute))
    rememberOrg('acme', storage, at(0))
    rememberOrg('globex', storage, at(1))
    rememberOrg('acme', storage, at(2))
    expect(recentOrgs(storage)).toEqual(['acme', 'globex'])
    expect(orgOpenedAt('acme', storage)).toBe('2026-10-31T09:02:00.000Z')
    expect(orgOpenedAt('globex', storage)).toBe('2026-10-31T09:01:00.000Z')
    for (const [i, slug] of ['a', 'b', 'c', 'd', 'e'].entries())
      rememberOrg(slug, storage, at(3 + i))
    expect(orgOpenedAt('globex', storage)).toBeNull()
    expect(orgOpenedAt('acme', storage)).toBeNull()
    expect(orgOpenedAt('e', storage)).toBe('2026-10-31T09:07:00.000Z')
  })

  it('reads an org list saved before times were kept, and a broken time map, as no time', () => {
    const storage = memoryStorage({
      'awaitstep:dashboard:recent-orgs': '["acme"]',
      'awaitstep:dashboard:org-opened-at': '["not", "a", "map"]',
    })
    expect(recentOrgs(storage)).toEqual(['acme'])
    expect(orgOpenedAt('acme', storage)).toBeNull()
    expect(orgOpenedAt('acme', throwing)).toBeNull()
    expect(() => rememberOrg('acme', throwing)).not.toThrow()
  })

  it('answers null for a slug that names a property of every object, and drops a time that isn’t one', () => {
    const storage = memoryStorage({
      'awaitstep:dashboard:org-opened-at':
        '{"acme":"yesterday-ish","globex":"2026-10-31T09:00:00.000Z"}',
    })
    expect(orgOpenedAt('constructor', storage)).toBeNull()
    expect(orgOpenedAt('toString', storage)).toBeNull()
    expect(orgOpenedAt('acme', storage)).toBeNull()
    expect(orgOpenedAt('globex', storage)).toBe('2026-10-31T09:00:00.000Z')
    rememberOrg('constructor', storage, new Date(Date.UTC(2026, 9, 31, 10)))
    expect(orgOpenedAt('constructor', storage)).toBe('2026-10-31T10:00:00.000Z')
  })
})
