import { describe, expect, it } from 'vitest'
import { isChromelessRoute } from '../shell-routes'

function matchesFor(...routeIds: string[]) {
  return routeIds.map((routeId) => ({ routeId }))
}

describe('isChromelessRoute', () => {
  it('treats the canvas editor as chromeless', () => {
    expect(
      isChromelessRoute(
        matchesFor('__root__', '/_authed', '/_authed/workflows/$workflowId/canvas'),
      ),
    ).toBe(true)
  })

  it('treats the deploy wizard as chromeless', () => {
    expect(
      isChromelessRoute(
        matchesFor('__root__', '/_authed', '/_authed/workflows/$workflowId/deploy'),
      ),
    ).toBe(true)
  })

  it('keeps the shell on regular pages', () => {
    expect(isChromelessRoute(matchesFor('__root__', '/_authed', '/_authed/dashboard'))).toBe(false)
  })

  it('keeps the shell on workflow sub-pages that are not canvas or deploy', () => {
    expect(
      isChromelessRoute(
        matchesFor('__root__', '/_authed', '/_authed/workflows/$workflowId/deployments'),
      ),
    ).toBe(false)
  })

  it('returns false for no matches', () => {
    expect(isChromelessRoute([])).toBe(false)
  })
})
