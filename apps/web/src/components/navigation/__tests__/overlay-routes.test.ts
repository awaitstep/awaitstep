import { describe, expect, it } from 'vitest'
import { Route as InboxRoute } from '../../../routes/_authed/$org.inbox'
import { Route as WhatsNewRoute } from '../../../routes/_authed/$org.whats-new'

type BeforeLoad = (ctx: { params: { org: string }; search: Record<string, string> }) => void

function redirectOf(route: { options: { beforeLoad?: unknown } }): unknown {
  try {
    ;(route.options.beforeLoad as BeforeLoad)({ params: { org: 'acme' }, search: { as: 'priya' } })
  } catch (error) {
    return error
  }
  return null
}

describe('old Inbox and What’s new URLs', () => {
  it('land on Projects with the overlay open, keeping the dev params', () => {
    expect(redirectOf(InboxRoute)).toMatchObject({
      options: { to: '/$org/projects', search: { as: 'priya', open: 'inbox' }, replace: true },
    })
    expect(redirectOf(WhatsNewRoute)).toMatchObject({
      options: { to: '/$org/projects', search: { as: 'priya', open: 'whats-new' } },
    })
  })
})
