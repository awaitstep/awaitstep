import { describe, expect, it } from 'vitest'
import { legacyTarget } from '../legacy-redirect'

const memory = (orgs: string[], projects: string[] = [], workspaces: string[] = []) => ({
  orgs,
  projectsIn: () => projects,
  workspacesIn: () => workspaces,
})

const mine = ['acme', 'active-org']

describe('legacyTarget', () => {
  it('lands on the page that replaced the old one, in the last workspace opened', () => {
    expect(legacyTarget('workflows', memory(['acme'], ['p'], ['sales']), mine, null)).toBe(
      '/acme/p/sales/workflows',
    )
    expect(legacyTarget('runs', memory(['acme'], ['p'], ['sales']), mine, null)).toBe(
      '/acme/p/sales/runs',
    )
  })

  it('falls back a level at a time: the project, the org home, Choose an organization', () => {
    expect(legacyTarget('runs', memory(['acme'], ['p']), mine, null)).toBe('/acme/p')
    expect(legacyTarget('runs', memory(['acme']), mine, null)).toBe('/acme/projects')
    expect(legacyTarget(null, memory(['acme'], ['p'], ['sales']), mine, null)).toBe(
      '/acme/projects',
    )
    expect(legacyTarget('runs', memory([]), mine, 'active-org')).toBe('/active-org/projects')
    expect(legacyTarget('runs', memory([]), [], null)).toBe('/choose-org')
  })

  it('skips remembered orgs the session cannot open: dummy visits, other accounts', () => {
    expect(legacyTarget('runs', memory(['dummy-acme', 'acme'], ['p']), mine, 'active-org')).toBe(
      '/acme/p',
    )
    expect(legacyTarget('runs', memory(['dummy-acme']), mine, 'active-org')).toBe(
      '/active-org/projects',
    )
  })

  it('sends an old org-wide page to its Org Settings page, dialog and all', () => {
    expect(legacyTarget({ settings: 'connections' }, memory(['acme'], ['p']), mine, null)).toBe(
      '/acme/settings/connections',
    )
    expect(
      legacyTarget({ settings: 'connections', newDialog: 'connection' }, memory([]), mine, 'acme'),
    ).toBe('/acme/settings/connections?new=connection')
    expect(legacyTarget({ settings: 'connections' }, memory([]), [], null)).toBe('/choose-org')
  })

  it('sends the old Account page to Your account in the last org opened', () => {
    expect(legacyTarget({ account: 'profile' }, memory(['acme'], ['p']), mine, null)).toBe(
      '/acme/account/profile',
    )
    expect(legacyTarget({ account: 'profile' }, memory([]), [], null)).toBe('/choose-org')
  })
})
