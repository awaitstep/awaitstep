import { describe, expect, it } from 'vitest'
import { inboxLanding } from '../inbox-landing'

describe('inboxLanding', () => {
  it.each([
    [
      'wider than a phone: the overlay over Projects',
      { as: 'priya' },
      false,
      { kind: 'redirect', to: '/$org/projects', search: { as: 'priya', open: 'inbox' } },
    ],
    ['a phone: the page', { as: 'priya' }, true, { kind: 'page' }],
    [
      'a phone asked for the overlay too: the page alone',
      { as: 'priya', open: 'inbox' },
      true,
      { kind: 'redirect', to: '/$org/inbox', search: { as: 'priya' } },
    ],
    [
      'a phone with another overlay open: the page under it',
      { open: 'whats-new' },
      true,
      { kind: 'page' },
    ],
  ])('%s', (_name, search, phone, landing) => {
    expect(inboxLanding(search, phone)).toEqual(landing)
  })
})
