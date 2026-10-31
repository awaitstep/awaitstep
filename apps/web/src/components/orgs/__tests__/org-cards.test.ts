import { describe, expect, it } from 'vitest'
import { filterOrgs, inviteMeta, orderOrgs, orgChips } from '../org-cards'
import { ACME, GLOBEX_INVITE, SANDBOX, orgListing } from './fixtures/dashboard'

describe('orderOrgs', () => {
  it('puts the most recently opened first, then orgs this browser never opened, by name', () => {
    const zeta = orgListing({ id: 'z', slug: 'zeta', name: 'Zeta', lastOpenedAt: null })
    const beta = orgListing({ id: 'b', slug: 'beta', name: 'Beta', lastOpenedAt: null })
    expect(orderOrgs([zeta, SANDBOX, beta, ACME]).map((o) => o.slug)).toEqual([
      'acme',
      'daniels-sandbox',
      'beta',
      'zeta',
    ])
  })
})

describe('filterOrgs', () => {
  it('matches the name ignoring case and spaces around the query', () => {
    expect(filterOrgs([ACME, SANDBOX], '  ACME ').map((o) => o.slug)).toEqual(['acme'])
    expect(filterOrgs([ACME, SANDBOX], '')).toHaveLength(2)
    expect(filterOrgs([ACME, SANDBOX], 'globex')).toEqual([])
  })
})

describe('orgChips', () => {
  it('shows a member the projects they can open and their own grants', () => {
    expect(orgChips(ACME)).toEqual(['1 project you can open', 'Sales · Editor'])
  })

  it('shows an owner the project count and "Just you" when alone', () => {
    expect(orgChips(SANDBOX)).toEqual(['2 projects', 'Just you'])
    expect(orgChips({ ...SANDBOX, role: 'admin', memberCount: 4, projectCount: 1 })).toEqual([
      '1 project',
      '4 people',
    ])
  })

  it('caps a member’s grants at two, then "+N more", workspaces before projects', () => {
    const many = orgListing({
      projectCount: 0,
      grants: {
        projects: [{ name: 'Project 202', role: 'admin' }],
        workspaces: [
          { name: 'Sales', projectName: 'Project 101', role: 'editor' },
          { name: 'IT', projectName: 'Project 101', role: 'viewer' },
        ],
      },
    })
    expect(orgChips(many)).toEqual([
      'No projects you can open yet',
      'Sales · Editor',
      'IT · Viewer',
      '+1 more',
    ])
  })
})

describe('inviteMeta', () => {
  it('reads role · place · expiry', () => {
    expect(inviteMeta(GLOBEX_INVITE)).toBe('Member · Platform workspace · expires 4 Nov')
    expect(
      inviteMeta({
        ...GLOBEX_INVITE,
        orgRole: 'admin',
        place: { kind: 'project', name: 'Core', role: 'admin' },
      }),
    ).toBe('Admin · Core · expires 4 Nov')
    expect(inviteMeta({ ...GLOBEX_INVITE, place: null })).toBe('Member · expires 4 Nov')
  })
})
