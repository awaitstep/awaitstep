import { describe, expect, it } from 'vitest'
import { isChromelessRoute } from '../shell-routes'

function matchesFor(...routeIds: string[]) {
  return routeIds.map((routeId) => ({ routeId }))
}

describe('isChromelessRoute', () => {
  it('treats the editor (canvas and code views) as chromeless', () => {
    expect(
      isChromelessRoute(
        matchesFor('__root__', '/_authed', '/_authed/workflows/$workflowId/editor'),
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

  it('keeps the shell on workflow sub-pages that are not the editor or deploy', () => {
    expect(
      isChromelessRoute(
        matchesFor('__root__', '/_authed', '/_authed/workflows/$workflowId/deployments'),
      ),
    ).toBe(false)
  })

  it('leaves the old sidebar off the new dashboard, which draws its own shell', () => {
    expect(
      isChromelessRoute(
        matchesFor('__root__', '/_authed', '/_authed/$org', '/_authed/$org/projects'),
      ),
    ).toBe(true)
    expect(isChromelessRoute(matchesFor('__root__', '/_authed', '/_authed/choose-org'))).toBe(true)
    // A prefix of the id, not of the text: an old route starting with "$org" isn't one.
    expect(isChromelessRoute(matchesFor('__root__', '/_authed', '/_authed/$organize'))).toBe(false)
  })

  it('returns false for no matches', () => {
    expect(isChromelessRoute([])).toBe(false)
  })
})
