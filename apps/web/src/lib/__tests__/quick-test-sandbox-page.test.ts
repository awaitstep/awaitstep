import { describe, expect, it } from 'vitest'
import {
  QUICK_TEST_SANDBOX_CACHE,
  QUICK_TEST_SANDBOX_HTML,
  QUICK_TEST_SANDBOX_PATH,
  QUICK_TEST_SANDBOX_POLICY,
  QUICK_TEST_SANDBOX_SRC,
  QUICK_TEST_SANDBOX_VERSION,
  quickTestSandboxResponse,
  sandboxPageVersion,
} from '../ide/quick-test-sandbox-page'
import { createRouter } from '@tanstack/react-router'
import { SLUG_PATTERN } from '@awaitstep/ir'
import { routeTree } from '../../routeTree.gen'

describe('the quick-test sandbox page', () => {
  it('goes out under its own sandbox policy, so it has an opaque origin however it is opened', async () => {
    const response = quickTestSandboxResponse()
    expect(response.headers.get('Content-Type')).toBe('text/html; charset=utf-8')
    expect(response.headers.get('Content-Security-Policy')).toBe(QUICK_TEST_SANDBOX_POLICY)
    expect(QUICK_TEST_SANDBOX_POLICY).toMatch(/^sandbox allow-scripts;/)
    expect(QUICK_TEST_SANDBOX_POLICY).not.toContain('allow-same-origin')
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(await response.text()).toBe(QUICK_TEST_SANDBOX_HTML)
  })

  it('may be cached under the URL the iframe loads, which names this page’s content', () => {
    // A network fetch on every run made a cold start slow enough to fail the
    // sandbox's boot budget; the fingerprint lets a deploy's new page through.
    const cached = quickTestSandboxResponse(
      new Request(`https://app.example${QUICK_TEST_SANDBOX_SRC}`),
    )
    expect(cached.headers.get('Cache-Control')).toBe(QUICK_TEST_SANDBOX_CACHE)
    expect(QUICK_TEST_SANDBOX_CACHE).toMatch(/^public, max-age=\d+/)
    expect(QUICK_TEST_SANDBOX_SRC).toBe(
      `${QUICK_TEST_SANDBOX_PATH}?v=${QUICK_TEST_SANDBOX_VERSION}`,
    )
  })

  it('revalidates under any other URL: an older fingerprint, or none', () => {
    for (const url of [
      `https://app.example${QUICK_TEST_SANDBOX_PATH}`,
      `https://app.example${QUICK_TEST_SANDBOX_PATH}?v=older`,
    ]) {
      const response = quickTestSandboxResponse(new Request(url))
      expect(response.headers.get('Cache-Control')).toBe('no-cache')
      // The policy goes out however it is asked for.
      expect(response.headers.get('Content-Security-Policy')).toBe(QUICK_TEST_SANDBOX_POLICY)
    }
    expect(quickTestSandboxResponse().headers.get('Cache-Control')).toBe('no-cache')
  })

  it('changes its fingerprint when the page changes', () => {
    expect(QUICK_TEST_SANDBOX_VERSION).toBe(sandboxPageVersion(QUICK_TEST_SANDBOX_HTML))
    expect(sandboxPageVersion(`${QUICK_TEST_SANDBOX_HTML} `)).not.toBe(QUICK_TEST_SANDBOX_VERSION)
    expect(QUICK_TEST_SANDBOX_VERSION).toMatch(/^[0-9a-z]+$/)
  })

  it('only listens for code to run when its origin is opaque', () => {
    expect(QUICK_TEST_SANDBOX_HTML).toContain("if (window.origin === 'null') window.onmessage")
  })

  describe('its bootstrap', () => {
    const script = QUICK_TEST_SANDBOX_HTML.slice(
      QUICK_TEST_SANDBOX_HTML.indexOf('<script>') + '<script>'.length,
      QUICK_TEST_SANDBOX_HTML.lastIndexOf('</script>'),
    )

    // Runs the page's script against a stand-in window; reports whether an
    // init message started a worker.
    function boot(framed: boolean) {
      const parent = {}
      const page: { origin: string; parent: unknown; onmessage: ((e: unknown) => void) | null } = {
        origin: 'null',
        parent: null,
        onmessage: null,
      }
      page.parent = framed ? parent : page
      const workers: string[] = []
      class FakeWorker {
        constructor(url: string) {
          workers.push(url)
        }
      }
      const fakeUrl = { createObjectURL: () => 'blob:null/worker' }
      new Function('window', 'URL', 'Blob', 'Worker', script)(page, fakeUrl, Blob, FakeWorker)
      const port = { postMessage: () => {}, onmessage: null }
      const send = (source: unknown) =>
        page.onmessage?.({ source, data: { type: 'init', workerSource: '' }, ports: [port] })
      return { parent, page, workers, send }
    }

    it('starts a worker for an init from its parent', () => {
      const { parent, workers, send } = boot(true)
      send(parent)
      expect(workers).toHaveLength(1)
    })

    it('ignores an init from any other window, and still accepts its parent’s after it', () => {
      const { parent, workers, send } = boot(true)
      send({})
      expect(workers).toHaveLength(0)
      send(parent)
      expect(workers).toHaveLength(1)
    })

    it('runs nothing when opened on its own rather than framed', () => {
      const { page, workers, send } = boot(false)
      send(page)
      send({})
      expect(workers).toHaveLength(0)
    })
  })

  it('is a route of the web app at the path the iframe loads', () => {
    const matches = createRouter({ routeTree }).matchRoutes(QUICK_TEST_SANDBOX_PATH)
    expect(matches[matches.length - 1]?.routeId).toBe(QUICK_TEST_SANDBOX_PATH)
  })

  it('sits at a path no organization slug can take', () => {
    expect(SLUG_PATTERN.test(QUICK_TEST_SANDBOX_PATH.slice(1))).toBe(false)
  })
})
