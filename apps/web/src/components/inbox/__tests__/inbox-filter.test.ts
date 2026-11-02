import { describe, expect, it } from 'vitest'
import type { InboxNotification, Release } from '../../../types/dashboard/inbox'
import {
  filterInbox,
  filterReleases,
  inboxCounts,
  inboxEmptyKind,
  isUpToDate,
  releasesView,
} from '../inbox-filter'

const note = (id: string, read: boolean, needsAction: boolean): InboxNotification => ({
  id,
  kind: 'failure',
  event: 'run.failed',
  count: 1,
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

describe('inboxEmptyKind', () => {
  const counts = (all: number, unread: number, action: number) => ({ all, unread, action })

  it('tells an Inbox nothing ever reached from a filter that matches nothing', () => {
    expect(inboxEmptyKind(counts(0, 0, 0), 'all')).toBe('none')
    expect(inboxEmptyKind(counts(0, 0, 0), 'unread')).toBe('none')
    expect(inboxEmptyKind(counts(0, 0, 0), 'action')).toBe('none')
    expect(inboxEmptyKind(counts(6, 0, 2), 'unread')).toBe('read')
    expect(inboxEmptyKind(counts(6, 3, 0), 'action')).toBe('done')
  })

  it('never says caught up while the counts still hold matches the listed rows left out', () => {
    // 140 notifications, the newest 100 all read: the list has no unread row, the count says 3.
    expect(inboxEmptyKind(counts(140, 3, 0), 'unread')).toBe('older')
    expect(inboxEmptyKind(counts(140, 0, 2), 'action')).toBe('older')
  })
})

describe('what the What’s new body shows', () => {
  const release = (tag: Release['tag'], fresh: boolean) => ({ tag, fresh }) as Release

  it('has no notes at all, a tag with none, or the list', () => {
    expect(releasesView([], 'all')).toBe('none')
    expect(releasesView([], 'fixed')).toBe('none')
    expect(releasesView([release('new', false)], 'fixed')).toBe('nomatch')
    expect(releasesView([release('new', false)], 'new')).toBe('list')
    expect(releasesView([release('new', false)], 'all')).toBe('list')
  })

  it('is up to date only when there are notes and none is new to the viewer', () => {
    expect(isUpToDate([])).toBe(false)
    expect(isUpToDate([release('new', true), release('fixed', false)])).toBe(false)
    expect(isUpToDate([release('new', false)])).toBe(true)
  })
})
