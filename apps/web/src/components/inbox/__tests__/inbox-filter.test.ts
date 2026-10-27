import { describe, expect, it } from 'vitest'
import type { InboxNotification, Release } from '../../../types/dashboard/inbox'
import { filterInbox, filterReleases, inboxCounts } from '../inbox-filter'

const note = (id: string, read: boolean, needsAction: boolean): InboxNotification => ({
  id,
  kind: 'failure',
  title: id,
  where: 'Acme Inc',
  at: '2026-10-27T09:00:00.000Z',
  read,
  needsAction,
})

const LIST = [note('a', false, true), note('b', true, true), note('c', true, false)]

describe('inbox filter', () => {
  it('counts every pill from the whole list', () => {
    expect(inboxCounts(LIST)).toEqual({ all: 3, unread: 1, action: 2 })
  })

  it('narrows to unread or needing action', () => {
    expect(filterInbox(LIST, 'all').map((n) => n.id)).toEqual(['a', 'b', 'c'])
    expect(filterInbox(LIST, 'unread').map((n) => n.id)).toEqual(['a'])
    expect(filterInbox(LIST, 'action').map((n) => n.id)).toEqual(['a', 'b'])
  })

  it('keeps rows answered while open, so their outcome shows', () => {
    const keep = new Set(['c'])
    expect(filterInbox(LIST, 'unread', keep).map((n) => n.id)).toEqual(['a', 'c'])
    expect(filterInbox(LIST, 'action', keep).map((n) => n.id)).toEqual(['a', 'b', 'c'])
  })

  it('narrows releases by tag', () => {
    const release = (id: string, tag: Release['tag']): Release => ({
      id,
      tag,
      date: '2026-10-24',
      title: id,
      body: '',
      link: { label: 'Open', href: '/acme/projects' },
      fresh: false,
    })
    const releases = [release('a', 'new'), release('b', 'fixed')]
    expect(filterReleases(releases, 'fixed').map((r) => r.id)).toEqual(['b'])
    expect(filterReleases(releases, 'all')).toHaveLength(2)
  })
})
