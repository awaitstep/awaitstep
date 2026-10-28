import { AMA } from './fixtures/people'
import { getDb, saveDb, syntheticPeople } from './db'

/**
 * Forces a system state on every dummy call: `loading` never answers,
 * `error` fails, `empty` returns no list rows, `viewer` treats the dummy user
 * as a Viewer wherever they can see. Dev-only; it goes with the mocks.
 */
export type MockScenario = 'none' | 'loading' | 'error' | 'empty' | 'viewer'

export interface MockContext {
  scenario: MockScenario
  /** Which sample person the dummy session is signed in as. */
  userId: string
  /**
   * The dashboard is on the real API and this call reaches a feature still on
   * dummy data: it answers empty for the real scope and refuses to write.
   */
  real?: boolean
}

export const NOT_CONNECTED = 'This isn’t connected to the API yet'

export const DEFAULT_MOCK_CONTEXT: MockContext = { scenario: 'none', userId: AMA }

export class MockApiError extends Error {
  readonly status: number
  readonly errorId: string
  /** The form field a validation error belongs to (`name`, `slug`…), when it has one. */
  readonly field: string | undefined

  constructor(status: number, message: string, field?: string) {
    super(message)
    this.name = 'MockApiError'
    this.status = status
    this.field = field
    this.errorId = `req_${crypto.randomUUID().replaceAll('-', '').slice(0, 8)}`
  }
}

export const notFoundError = () => new MockApiError(404, 'Not found')
export const forbiddenError = (reason: string) => new MockApiError(403, reason)
export const conflictError = (reason: string, field?: string) =>
  new MockApiError(409, reason, field)
export const invalidError = (reason: string, field?: string) => new MockApiError(422, reason, field)

// Long enough to see the skeletons in the app; tests don't wait.
const LATENCY_MS = import.meta.env.MODE === 'test' ? 0 : 250

function delay(ms: number): Promise<void> {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve()
}

async function run<T>(
  ctx: MockContext,
  call: () => T,
  options: { frame?: boolean; writes?: boolean } = {},
): Promise<T> {
  const frame = options.frame ?? false
  if (ctx.scenario === 'loading' && !frame) return new Promise<T>(() => {})
  await delay(LATENCY_MS)
  if (ctx.scenario === 'error' && !frame) {
    throw new MockApiError(503, 'The service didn’t answer in time.')
  }
  if (ctx.real) {
    if (options.writes) throw new MockApiError(501, NOT_CONNECTED)
    ensureRealViewer(ctx)
  }
  // A copy, as a real response is: records often hold the table's own rows
  // (people), and a later mutation must not change what the cache holds.
  return structuredClone(call())
}

/**
 * The signed-in person, as the dummy tables know them, so a feature still on
 * dummy data can name the viewer. In memory only: nothing saves it.
 */
function ensureRealViewer(ctx: MockContext): void {
  const db = getDb()
  if (db.people.some((p) => p.id === ctx.userId)) return
  db.people.push({ id: ctx.userId, name: 'You', email: '', initials: '?', image: null })
  syntheticPeople.add(ctx.userId)
}

/** A read endpoint of the fake API: async, and subject to the scenario. */
export function endpoint<A extends unknown[], R>(
  handler: (ctx: MockContext, ...args: A) => R,
): (ctx: MockContext, ...args: A) => Promise<R> {
  return (ctx, ...args) => run(ctx, () => handler(ctx, ...args))
}

/**
 * A read the page frame needs (viewer, orgs, scope, the workspace switcher).
 * It still answers under `loading` and `error`, because the boards keep the
 * breadcrumbs, title and menu while only the lists wait or fail.
 */
export function frameEndpoint<A extends unknown[], R>(
  handler: (ctx: MockContext, ...args: A) => R,
): (ctx: MockContext, ...args: A) => Promise<R> {
  return (ctx, ...args) => run(ctx, () => handler(ctx, ...args), { frame: true })
}

/** A write endpoint: as `endpoint`, and the tab's db is saved after it succeeds. */
export function mutation<A extends unknown[], R>(
  handler: (ctx: MockContext, ...args: A) => R,
): (ctx: MockContext, ...args: A) => Promise<R> {
  return (ctx, ...args) =>
    run(
      ctx,
      () => {
        const result = handler(ctx, ...args)
        saveDb()
        return result
      },
      { writes: true },
    )
}

/** List rows, or none under the `empty` scenario. */
export function rows<T>(ctx: MockContext, list: T[]): T[] {
  return ctx.scenario === 'empty' ? [] : list
}
