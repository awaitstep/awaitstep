import { describe, expect, it } from 'vitest'
import { isNavItemActive } from '../nav'

describe('isNavItemActive', () => {
  it('matches the dashboard exactly', () => {
    expect(isNavItemActive(['__root__', '/_authed', '/_authed/dashboard'], '/dashboard')).toBe(true)
    expect(isNavItemActive(['__root__', '/_authed', '/_authed/workflows/'], '/dashboard')).toBe(
      false,
    )
  })

  it('keeps Workflows active on workflow detail pages', () => {
    const routeIds = [
      '__root__',
      '/_authed',
      '/_authed/workflows/$workflowId',
      '/_authed/workflows/$workflowId/deployments',
    ]
    expect(isNavItemActive(routeIds, '/workflows')).toBe(true)
  })

  it('activates Workflows, not Runs, for workflow-scoped runs', () => {
    const routeIds = [
      '__root__',
      '/_authed',
      '/_authed/workflows/$workflowId',
      '/_authed/workflows/$workflowId/runs',
      '/_authed/workflows/$workflowId/runs/',
    ]
    expect(isNavItemActive(routeIds, '/workflows')).toBe(true)
    expect(isNavItemActive(routeIds, '/runs')).toBe(false)
  })

  it('keeps Runs active on the run detail page', () => {
    const routeIds = ['__root__', '/_authed', '/_authed/runs/$runId']
    expect(isNavItemActive(routeIds, '/runs')).toBe(true)
  })

  it('knows no Connections (B9) or env-vars (B4) page any more', () => {
    expect(isNavItemActive(['/_authed/connections'], '/connections')).toBe(false)
    expect(isNavItemActive(['/_authed/connections'], '/env-vars')).toBe(false)
    expect(isNavItemActive(['/_authed/env-vars'], '/env-vars')).toBe(false)
  })

  it('matches settings exactly', () => {
    expect(isNavItemActive(['/_authed/settings'], '/settings')).toBe(true)
  })

  it('no longer tracks account or the playground (they moved to the new shell)', () => {
    // Their old flat routes were deleted; the old sidebar doesn't own them anymore.
    expect(isNavItemActive(['/_authed/_orgless/account/profile'], '/account')).toBe(false)
    expect(isNavItemActive(['/_authed/_orgless/api-playground'], '/api-playground')).toBe(false)
  })

  it('returns false for unknown targets', () => {
    expect(isNavItemActive(['/_authed/dashboard'], '/nope')).toBe(false)
  })
})
