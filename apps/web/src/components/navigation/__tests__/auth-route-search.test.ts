import { describe, expect, it } from 'vitest'
import { Route as ChooseOrgRoute } from '../../../routes/_authed/choose-org'
import { Route as InviteRoute } from '../../../routes/invite.$token'

type Middleware = (ctx: {
  search: Record<string, unknown>
  next: unknown
}) => Record<string, unknown>

/** The search a link that names none ends up with, leaving a page that carries ?as= and ?mock=. */
function nextSearch(route: { options: { search?: { middlewares?: unknown[] } } }) {
  const middlewares = (route.options.search?.middlewares ?? []) as Middleware[]
  // The router's own `next`: the link's search, plus what it removed or set.
  const next = () => ({ search: {}, meta: {} })
  return middlewares.reduce<Record<string, unknown>>(
    (_, middleware) => middleware({ search: { as: 'daniel', mock: 'empty' }, next }),
    {},
  )
}

describe('choose-org and invite links keep the dummy session', () => {
  it('carry ?as= and ?mock= over, as the org pages do', () => {
    expect(nextSearch(ChooseOrgRoute)).toMatchObject({ as: 'daniel', mock: 'empty' })
    expect(nextSearch(InviteRoute)).toMatchObject({ as: 'daniel', mock: 'empty' })
  })
})
