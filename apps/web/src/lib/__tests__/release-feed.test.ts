import { describe, expect, it } from 'vitest'
import type { ReleaseNote } from '../../content/releases'
import { RELEASE_NOTES } from '../../content/releases'
import { releaseFeed } from '../release-feed'

const NOTE: ReleaseNote = {
  id: 'n',
  tag: 'new',
  date: '2026-10-20T15:00:00.000Z',
  title: 'T',
  body: 'B',
  link: { label: 'Keys', page: { settings: 'members' } },
}

describe('releaseFeed', () => {
  it('keeps links in the org', () => {
    const feed = releaseFeed(
      'acme',
      [NOTE, { ...NOTE, id: 'm', link: { label: 'Audit', page: 'audit' } }],
      { lastVisit: null, seen: [] },
    )
    expect(feed.releases.map((r) => r.link.href)).toEqual(['/acme/settings/members', '/acme/audit'])
  })

  it('marks everything new for someone who never looked', () => {
    expect(releaseFeed('acme', [NOTE], { lastVisit: null, seen: [] }).releases[0]!.fresh).toBe(true)
  })

  it('marks a note new until it is seen, whatever its date', () => {
    // Shipped in an upgrade after the visit, though dated before it: still new.
    const visit = { lastVisit: '2026-11-10T09:00:00.000Z', seen: ['m'] }
    expect(releaseFeed('acme', [NOTE], visit).releases[0]!.fresh).toBe(true)
    const seen = { ...visit, seen: ['n'] }
    expect(releaseFeed('acme', [NOTE], seen).releases[0]!.fresh).toBe(false)
  })
})

describe('RELEASE_NOTES', () => {
  it('lists newest first, with unique ids', () => {
    const instants = RELEASE_NOTES.map((n) => Date.parse(n.date))
    expect([...instants].sort((a, b) => b - a)).toEqual(instants)
    expect(new Set(RELEASE_NOTES.map((n) => n.id)).size).toBe(RELEASE_NOTES.length)
  })
})
