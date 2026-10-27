import { describe, expect, it } from 'vitest'
import { Route } from '../../../routes/_authed/$org.$project.$workspace.index'

type BeforeLoad = (ctx: { params: { org: string; project: string; workspace: string } }) => void

describe('bare workspace URL', () => {
  it('redirects to the default page, Overview, like the cards and switchers', () => {
    const beforeLoad = Route.options.beforeLoad as unknown as BeforeLoad
    let thrown: unknown
    try {
      beforeLoad({ params: { org: 'acme', project: 'project-101', workspace: 'sales' } })
    } catch (error) {
      thrown = error
    }
    expect(thrown).toMatchObject({
      options: {
        to: '/$org/$project/$workspace/overview',
        params: { org: 'acme', project: 'project-101', workspace: 'sales' },
        replace: true,
      },
    })
  })
})
