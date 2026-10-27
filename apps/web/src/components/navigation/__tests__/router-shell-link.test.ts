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
      new: undefined,
      then: undefined,
      access: undefined,
      project: undefined,
      variable: undefined,
      tab: undefined,
    })
  })

  it('reads numbers and booleans back as the text they were written as', () => {
    // The router JSON-parses `?override=1` and `?variable=true`.
    expect(validateDashboardSearch({ tab: 1, variable: true })).toMatchObject({
      tab: '1',
      variable: 'true',
    })
  })

  it('drops other params and anything that isn’t text, a number or a boolean', () => {
    expect(validateDashboardSearch({ mock: { a: 1 }, as: ['x'], new: null, page: '2' })).toEqual({
      mock: undefined,
      as: undefined,
      new: undefined,
      then: undefined,
      access: undefined,
      project: undefined,
      variable: undefined,
      tab: undefined,
    })
  })

  it('keeps the dialog a switcher asked for', () => {
    expect(validateDashboardSearch({ new: 'project' })).toMatchObject({ new: 'project' })
  })

  it('keeps the access-editor and variable dialog params', () => {
    expect(
      validateDashboardSearch({
        access: 'add',
        project: 'project-101',
        variable: 'REGION',
      }),
    ).toMatchObject({ access: 'add', project: 'project-101', variable: 'REGION' })
  })
})
