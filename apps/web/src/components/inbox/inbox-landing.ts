type Search = Record<string, unknown>

export type InboxLanding =
  { kind: 'page' } | { kind: 'redirect'; to: '/$org/projects' | '/$org/inbox'; search: Search }

/**
 * Where `/$org/inbox` lands. On a phone it is the Inbox page, without the
 * overlay asked for on top of it (`?open=inbox` would open a second Inbox
 * over the first). Wider, it opens the overlay over Projects (D-P8-1), as
 * old links expect.
 */
export function inboxLanding(search: Search, phone: boolean): InboxLanding {
  if (!phone)
    return { kind: 'redirect', to: '/$org/projects', search: { ...search, open: 'inbox' } }
  if (search.open !== 'inbox') return { kind: 'page' }
  const { open: _open, ...rest } = search
  return { kind: 'redirect', to: '/$org/inbox', search: rest }
}
