import { beforeEach, describe, expect, it, vi } from 'vitest'

// The Cloudflare Worker entry, with the SSR handler and the request context
// stubbed: what it hands the router and what it puts in the header.
const ssr = vi.hoisted(() => ({
  fetch: vi.fn<(request: Request, opts: { context: { nonce: string } }) => Promise<Response>>(),
}))
vi.mock('@tanstack/react-start/server-entry', () => ({ default: ssr }))
vi.mock('../lib/cf-context', () => ({
  runWithCfContext: (_ctx: unknown, fn: () => unknown) => fn(),
}))

const { default: worker } = await import('../worker')
const { Route: SandboxRoute } = await import('../routes/quick-test-sandbox[.]html')
const { QUICK_TEST_SANDBOX_POLICY, QUICK_TEST_SANDBOX_SRC, QUICK_TEST_SANDBOX_CACHE } =
  await import('../lib/ide/quick-test-sandbox-page')

/** The sandbox page's own server route handler, as Start would call it. */
const sandboxGet = (
  SandboxRoute.options as unknown as {
    server: { handlers: { GET: (ctx: { request: Request }) => Response | Promise<Response> } }
  }
).server.handlers.GET

function env(overrides: Record<string, unknown> = {}) {
  return {
    API: { fetch: vi.fn(async () => new Response('api')) },
    ...overrides,
  } as unknown as Parameters<typeof worker.fetch>[1]
}

function scriptSrc(response: Response): string | undefined {
  return response.headers
    .get('Content-Security-Policy')
    ?.split('; ')
    .find((directive) => directive.startsWith('script-src '))
}

beforeEach(() => {
  ssr.fetch.mockReset()
  ssr.fetch.mockImplementation(
    async (_request, opts) =>
      new Response(`<script nonce="${opts.context.nonce}"></script>`, {
        headers: { 'Content-Type': 'text/html' },
      }),
  )
})

describe('the web Worker’s page policy', () => {
  it('hands the router the nonce it puts in the header', async () => {
    const response = await worker.fetch(new Request('https://app.example/acme'), env())
    const nonce = ssr.fetch.mock.calls[0]![1].context.nonce
    expect(scriptSrc(response)).toBe(`script-src 'self' 'nonce-${nonce}'`)
    expect(await response.text()).toBe(`<script nonce="${nonce}"></script>`)
  })

  it('never takes the nonce from the request', async () => {
    const response = await worker.fetch(
      new Request('https://app.example/acme', {
        headers: { 'x-csp-nonce': 'AAAAAAAAAAAAAAAAAAAAAA==', 'Content-Security-Policy': 'x' },
      }),
      env(),
    )
    expect(ssr.fetch.mock.calls[0]![1].context.nonce).not.toBe('AAAAAAAAAAAAAAAAAAAAAA==')
    expect(scriptSrc(response)).not.toContain('AAAAAAAAAAAAAAAAAAAAAA==')
  })

  it('gives every page a fresh nonce', async () => {
    await worker.fetch(new Request('https://app.example/a'), env())
    await worker.fetch(new Request('https://app.example/b'), env())
    const [first, second] = ssr.fetch.mock.calls.map(([, opts]) => opts.context.nonce)
    expect(first).not.toBe(second)
  })

  it('names the configured registry for node icons', async () => {
    const response = await worker.fetch(
      new Request('https://app.example/acme'),
      env({ REGISTRY_URL: 'https://icons.example.org/registry' }),
    )
    expect(response.headers.get('Content-Security-Policy')).toContain('https://icons.example.org')
  })

  it('keeps the quick-test sandbox page’s own policy and caching, from its real route', async () => {
    ssr.fetch.mockImplementation(async (request) => sandboxGet({ request }))
    const response = await worker.fetch(
      new Request(`https://app.example${QUICK_TEST_SANDBOX_SRC}`),
      env(),
    )
    expect(response.headers.get('Content-Security-Policy')).toBe(QUICK_TEST_SANDBOX_POLICY)
    expect(response.headers.get('Cache-Control')).toBe(QUICK_TEST_SANDBOX_CACHE)
    expect(await response.text()).toContain("window.origin === 'null'")
  })

  it('passes /api/ through to the API untouched', async () => {
    const bindings = env()
    const response = await worker.fetch(new Request('https://app.example/api/scope'), bindings)
    expect(await response.text()).toBe('api')
    expect(response.headers.has('Content-Security-Policy')).toBe(false)
    expect(ssr.fetch).not.toHaveBeenCalled()
  })
})
