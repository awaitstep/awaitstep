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

  it('matches connections and env-vars exactly', () => {
    expect(isNavItemActive(['/_authed/connections'], '/connections')).toBe(true)
    expect(isNavItemActive(['/_authed/env-vars'], '/env-vars')).toBe(true)
    expect(isNavItemActive(['/_authed/connections'], '/env-vars')).toBe(false)
  })

  it('matches settings, account, and the api playground exactly', () => {
    expect(isNavItemActive(['/_authed/settings'], '/settings')).toBe(true)
    expect(isNavItemActive(['/_authed/account'], '/account')).toBe(true)
    expect(isNavItemActive(['/_authed/api-playground'], '/api-playground')).toBe(true)
  })

  it('returns false for unknown targets', () => {
    expect(isNavItemActive(['/_authed/dashboard'], '/nope')).toBe(false)
  })
})
