import { onTestFinished } from 'vitest'
import { API_BASE } from '../../lib/api-path'
import { AMA, createApiFixtures, type FakeApiData, type PersonId } from '../fixtures/api'
import { installFetchDispatcher, routeFetchTo } from './fetch-dispatcher'
import { apiError, isReply, pending, reply, type FakeReply } from './responses'
import { matchRoute, parseRoute, type RoutePattern } from './route-pattern'
import { baseRoutes } from './routes'
import type { FakeRequest, RouteAnswer, RouteTable } from './types'

export interface FakeApiOptions {
  /** Whose session the requests carry; the default fixtures are Ama's. */
  viewer?: PersonId
  /** What fixture times are relative to. */
  now?: Date
  /** Routes answered on top of the defaults, as `api.on` would. */
  routes?: RouteTable
}

export interface FakeApi {
  /** The fixtures the default routes answer from, read at request time: edit them to change an answer. */
  readonly data: FakeApiData
  readonly viewer: PersonId
  readonly now: Date
  /** Every call so far, oldest first. */
  readonly requests: readonly FakeRequest[]
  /** Calls no route answered (each got a 404), and handlers that threw. They fail the test. */
  readonly problems: readonly string[]
  /** Answers `route` with `answer` from now on, over the default and any earlier `on`. */
  on(route: string, answer: RouteAnswer): void
  /** Answers `route` with the API's `{ error }` refusal. */
  fail(route: string, status: number, error: string, extra?: Record<string, unknown>): void
  /** Never answers `route`: the page stays loading. */
  hang(route: string): void
  /** The calls `route` matches (`'POST /account/orgs/:orgId/leave'` or a concrete path). */
  requestsTo(route: string): FakeRequest[]
  /** The newest call `route` matches; throws when there is none. */
  lastRequest(route: string): FakeRequest
  /** Throws when a call went unanswered or a handler threw. Runs when the test finishes. */
  assertNoProblems(): void
  /** The `fetch` the fake answers as. */
  readonly fetch: typeof globalThis.fetch
}

/** Where the app is served; relative calls resolve against it. */
const appOrigin = () => globalThis.location?.origin ?? 'http://localhost'

interface Route {
  pattern: RoutePattern
  answer: RouteAnswer
}

function headersOf(init: RequestInit | undefined, request: Request | null): Record<string, string> {
  const headers = new Headers(request?.headers)
  new Headers(init?.headers).forEach((value, name) => headers.set(name, value))
  return Object.fromEntries(
    [...headers.entries()].map(([name, value]) => [name.toLowerCase(), value]),
  )
}

async function bodyOf(init: RequestInit | undefined, request: Request | null): Promise<unknown> {
  const raw = init?.body ?? (request ? await request.clone().text() : undefined)
  if (raw === undefined || raw === null || raw === '') return undefined
  if (typeof raw !== 'string') return raw
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return raw
  }
}

function toResponse(answer: FakeReply): Response {
  return new Response(answer.body === undefined ? null : JSON.stringify(answer.body), {
    status: answer.status,
    headers: { 'content-type': 'application/json', ...answer.headers },
  })
}

export function createFakeApi(options: FakeApiOptions = {}): FakeApi {
  const now = options.now ?? new Date()
  const viewer = options.viewer ?? AMA
  const data = createApiFixtures(now)
  const routes: Route[] = []
  const requests: FakeRequest[] = []
  const problems: string[] = []

  function on(route: string, answer: RouteAnswer) {
    routes.push({ pattern: parseRoute(route), answer })
  }

  function find(method: string, path: string) {
    for (let i = routes.length - 1; i >= 0; i--) {
      const params = matchRoute(routes[i]!.pattern, method, path)
      if (params) return { route: routes[i]!, params }
    }
    return null
  }

  async function answer(route: Route, req: FakeRequest): Promise<FakeReply> {
    const value = typeof route.answer === 'function' ? await route.answer(req) : route.answer
    if (value === undefined) {
      throw new Error(`the handler for ${route.pattern.source} returned nothing`)
    }
    return isReply(value) ? value : reply(200, value)
  }

  const fakeFetch: typeof globalThis.fetch = async (input, init) => {
    const request = input instanceof Request ? input : null
    const url = new URL(request?.url ?? String(input), appOrigin())
    const method = (init?.method ?? request?.method ?? 'GET').toUpperCase()
    const underApi = url.origin === appOrigin() && url.pathname.startsWith(`${API_BASE}/`)
    const path = underApi ? url.pathname.slice(API_BASE.length) : url.href
    const found = underApi ? find(method, path) : null
    const req: FakeRequest = {
      method,
      path,
      query: Object.fromEntries(url.searchParams),
      body: await bodyOf(init, request),
      headers: headersOf(init, request),
      params: found?.params ?? {},
    }
    requests.push(req)
    if (!found) {
      const message = `Fake API: no route for ${method} ${path}`
      problems.push(message)
      return toResponse(apiError(404, message))
    }
    try {
      return toResponse(await answer(found.route, req))
    } catch (failure) {
      const message = `Fake API: ${method} ${path} failed: ${failure instanceof Error ? failure.message : String(failure)}`
      problems.push(message)
      return toResponse(apiError(500, message))
    }
  }

  for (const [route, value] of Object.entries(baseRoutes({ data, viewer, now }))) on(route, value)
  for (const [route, value] of Object.entries(options.routes ?? {})) on(route, value)

  function requestsTo(route: string) {
    const pattern = parseRoute(route)
    return requests.filter((req) => matchRoute(pattern, req.method, req.path))
  }

  return {
    data,
    viewer,
    now,
    requests,
    problems,
    on,
    fail: (route, status, error, extra) => on(route, apiError(status, error, extra)),
    hang: (route) => on(route, () => pending()),
    requestsTo,
    lastRequest(route) {
      const found = requestsTo(route).at(-1)
      if (!found) {
        const seen = requests.map((r) => `${r.method} ${r.path}`).join(', ') || 'none'
        throw new Error(`Fake API: no request matched ${route}. Requests: ${seen}`)
      }
      return found
    },
    assertNoProblems() {
      if (problems.length > 0) throw new Error(problems.join('\n'))
    },
    fetch: fakeFetch,
  }
}

/**
 * A fake API answering every `fetch` for the rest of the current test, then
 * gone. The test fails when a call went unanswered or a handler threw.
 */
export function installFakeApi(options: FakeApiOptions = {}): FakeApi {
  const api = createFakeApi(options)
  // The DOM setup installed it already; a node-environment test gets it here.
  installFetchDispatcher()
  routeFetchTo(api.fetch)
  onTestFinished(() => {
    routeFetchTo(null)
    api.assertNoProblems()
  })
  return api
}
