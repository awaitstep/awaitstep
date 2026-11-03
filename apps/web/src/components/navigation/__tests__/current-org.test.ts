import { describe, expect, it } from 'vitest'
import type { Organization } from '../../../stores/org-store'
import { pickCurrentOrg } from '../current-org'

function org(slug: string, id = slug): Organization {
  return { id, name: slug, slug, createdAt: '2026-01-01T00:00:00.000Z' }
}

const acme = org('acme')
const bolt = org('bolt', 'bolt-id')
const orgs = [acme, bolt]

describe('pickCurrentOrg', () => {
  it('prefers the most recent org the session can still open', () => {
    expect(pickCurrentOrg(orgs, 'acme', ['bolt', 'acme'])).toBe(bolt)
  })

  it('skips recent orgs that are no longer in the session', () => {
    expect(pickCurrentOrg(orgs, 'acme', ['ghost', 'bolt'])).toBe(bolt)
  })

  it('falls back to the active org when nothing recent matches', () => {
    expect(pickCurrentOrg(orgs, 'bolt-id', [])).toBe(bolt)
    expect(pickCurrentOrg(orgs, 'bolt-id', ['ghost'])).toBe(bolt)
  })

  it('falls back to the first org when there is no active one either', () => {
    expect(pickCurrentOrg(orgs, null, [])).toBe(acme)
    expect(pickCurrentOrg(orgs, 'missing-id', [])).toBe(acme)
  })

  it('returns null with no organizations at all', () => {
    expect(pickCurrentOrg([], 'acme', ['acme'])).toBeNull()
  })
})
