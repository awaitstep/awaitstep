import { describe, expect, it } from 'vitest'
import { connectionServes, tokenUsable } from '../connections.js'

const NOW = new Date('2026-10-30T12:00:00.000Z')

describe('tokenUsable', () => {
  it('counts an active token without expiry as usable', () => {
    expect(tokenUsable('active', null, NOW)).toBe(true)
  })

  it('counts a token before its expiry as usable and after it as not', () => {
    expect(tokenUsable('active', '2026-10-30T12:00:01.000Z', NOW)).toBe(true)
    expect(tokenUsable('active', '2026-10-30T12:00:00.000Z', NOW)).toBe(false)
  })

  it('never counts an invalid token as usable', () => {
    expect(tokenUsable('invalid', null, NOW)).toBe(false)
  })

  it('gives a not-yet-checked token the benefit of the doubt until it expires', () => {
    expect(tokenUsable('unchecked', null, NOW)).toBe(true)
    expect(tokenUsable('unchecked', '2026-10-01T00:00:00.000Z', NOW)).toBe(false)
  })
})

describe('connectionServes', () => {
  const P101 = { id: 'p-101', name: 'Project 101', slug: 'project-101' }

  it('serves every project when not narrowed', () => {
    expect(connectionServes({ allProjects: true, projects: [] }, 'p-202')).toBe(true)
  })

  it('serves only the listed projects when narrowed', () => {
    expect(connectionServes({ allProjects: false, projects: [P101] }, 'p-101')).toBe(true)
    expect(connectionServes({ allProjects: false, projects: [P101] }, 'p-202')).toBe(false)
    expect(connectionServes({ allProjects: false, projects: [] }, 'p-101')).toBe(false)
  })
})
