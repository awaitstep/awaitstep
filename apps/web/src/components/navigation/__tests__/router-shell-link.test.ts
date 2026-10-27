import { describe, expect, it } from 'vitest'
import { validateDashboardSearch } from '../dashboard-providers'
import { routerTarget } from '../router-shell-link'

describe('routerTarget', () => {
  it('sends in-app paths through the router', () => {
    expect(routerTarget('/acme/projects')).toEqual({
      kind: 'router',
      to: '/acme/projects',
      search: undefined,
      hash: undefined,
    })
  })

  it('splits off the query and the fragment', () => {
    expect(routerTarget('/acme/projects?new=project&x=1#top')).toEqual({
      kind: 'router',
      to: '/acme/projects',
      search: { new: 'project', x: '1' },
      hash: 'top',
    })
    expect(routerTarget('/acme/audit#')).toMatchObject({ to: '/acme/audit', hash: undefined })
    expect(routerTarget('/a#b?c')).toMatchObject({ to: '/a', search: undefined, hash: 'b?c' })
  })

  it('leaves other sites, protocol-relative URLs and fragments-only to a plain anchor', () => {
    expect(routerTarget('https://docs.awaitstep.dev')).toEqual({ kind: 'anchor' })
    expect(routerTarget('//docs.example.com/x')).toEqual({ kind: 'anchor' })
    expect(routerTarget('#section')).toEqual({ kind: 'anchor' })
    expect(routerTarget('mailto:ama@acme.test')).toEqual({ kind: 'anchor' })
  })
})

describe('validateDashboardSearch', () => {
  it('keeps string mock and as params', () => {
    expect(validateDashboardSearch({ mock: 'viewer', as: 'daniel' })).toEqual({
      mock: 'viewer',
      as: 'daniel',
    })
  })

  it('drops other params and anything that isn’t a string', () => {
    expect(validateDashboardSearch({ mock: 3, as: ['x'], page: '2' })).toEqual({
      mock: undefined,
      as: undefined,
    })
  })
})
