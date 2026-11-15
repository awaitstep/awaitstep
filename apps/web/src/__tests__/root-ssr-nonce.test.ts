import { describe, expect, it } from 'vitest'
import { createRoute, createRouter } from '@tanstack/react-router'
import { createRequestHandler, defaultRenderHandler } from '@tanstack/react-router/ssr/server'
import { Route as RootRoute } from '../routes/__root'
import { ZOD_JITLESS_SCRIPT } from '../lib/zod-jitless'

// The real root route (its head scripts, ThemeScript, <Scripts />) server-
// rendered as a page is, under one empty child so no page's data is needed.
// The router gets the nonce the way router.tsx's createRouter hands it over.
const NONCE = 'q2Jk9xV0bZ3LmN4pR5sT6w=='

const page = createRoute({ getParentRoute: () => RootRoute, path: '/', component: () => null })
const routeTree = RootRoute.addChildren([page])

async function renderRoot(nonce: string | undefined): Promise<string> {
  const handler = createRequestHandler({
    request: new Request('http://localhost/'),
    createRouter: () => createRouter({ routeTree, ssr: { nonce } }),
  })
  const response = await handler(defaultRenderHandler)
  return response.text()
}

function scriptTags(html: string): string[] {
  return html.match(/<script\b[^>]*>/g) ?? []
}

describe('the root route, server-rendered under a nonce', () => {
  it('puts the nonce on every <script>, the theme and Zod scripts included', async () => {
    const html = await renderRoot(NONCE)
    const scripts = scriptTags(html)

    // The theme script (ScriptOnce) and the Zod head script are both there…
    expect(html).toContain('awaitstep-theme')
    expect(html).toContain(ZOD_JITLESS_SCRIPT)
    // …and nothing renders a script the policy would refuse.
    expect(scripts.length).toBeGreaterThanOrEqual(2)
    for (const tag of scripts) expect(tag).toContain(`nonce="${NONCE}"`)
  })

  it('renders the same scripts without a nonce when there is no policy', async () => {
    const html = await renderRoot(undefined)
    expect(html).toContain(ZOD_JITLESS_SCRIPT)
    for (const tag of scriptTags(html)) expect(tag).not.toContain('nonce=')
  })
})
