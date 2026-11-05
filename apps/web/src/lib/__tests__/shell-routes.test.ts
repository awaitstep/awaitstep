import { describe, expect, it } from 'vitest'
import { drawsOwnShell, isChromelessRoute, sendsToDashboard } from '../shell-routes'

function matchesFor(...routeIds: string[]) {
  return routeIds.map((routeId) => ({ routeId }))
}

describe('isChromelessRoute', () => {
  it('keeps the shell on regular pages', () => {
    expect(isChromelessRoute(matchesFor('__root__', '/_authed', '/_authed/settings'))).toBe(false)
  })

  it('keeps the shell on the old workflow URLs, which only redirect now', () => {
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
    expect(isChromelessRoute(matchesFor('__root__', '/_authed', '/_authed/dashboard'))).toBe(true)
    // A prefix of the id, not of the text: an old route starting with "$org" isn't one.
    expect(isChromelessRoute(matchesFor('__root__', '/_authed', '/_authed/$organize'))).toBe(false)
  })

  it('returns false for no matches', () => {
    expect(isChromelessRoute([])).toBe(false)
  })
})

describe('drawsOwnShell', () => {
  it('is the new dashboard only: the editor is chromeless but still an old page needing an org', () => {
    expect(drawsOwnShell(matchesFor('__root__', '/_authed', '/_authed/dashboard'))).toBe(true)
    expect(
      drawsOwnShell(matchesFor('__root__', '/_authed', '/_authed/$org', '/_authed/$org/audit')),
    ).toBe(true)
    expect(
      drawsOwnShell(matchesFor('__root__', '/_authed', '/_authed/workflows/$workflowId/editor')),
    ).toBe(false)
    expect(drawsOwnShell(matchesFor('__root__', '/_authed', '/_authed/settings'))).toBe(false)
  })
})

describe('sendsToDashboard', () => {
  const settings = matchesFor('__root__', '/_authed', '/_authed/settings')
  const editor = matchesFor('__root__', '/_authed', '/_authed/workflows/$workflowId/editor')
  const dashboard = matchesFor('__root__', '/_authed', '/_authed/dashboard')
  const orgHome = matchesFor('__root__', '/_authed', '/_authed/$org', '/_authed/$org/projects')

  it('sends an old page, the editor included, to /dashboard when you have no org', () => {
    expect(sendsToDashboard(0, 0, settings)).toBe(true)
    expect(sendsToDashboard(0, 0, editor)).toBe(true)
  })

  it('leaves the new dashboard alone: it handles having no org itself', () => {
    expect(sendsToDashboard(0, 0, dashboard)).toBe(false)
    expect(sendsToDashboard(0, 0, orgHome)).toBe(false)
  })

  it('lets you through with an org, including one just created that the cached list lacks', () => {
    expect(sendsToDashboard(2, 0, settings)).toBe(false)
    expect(sendsToDashboard(0, 1, settings)).toBe(false)
  })
})
