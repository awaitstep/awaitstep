import type { FakeApiData, PersonId } from '../fixtures/api'
import type { FakeReply } from './responses'

/** One call the page made, as the fake API received it. */
export interface FakeRequest {
  method: string
  /** The API path without `/api` and without the query: `/account/sessions/ses_1`. */
  path: string
  query: Record<string, string>
  /** JSON bodies parsed; a Blob or FormData as sent; undefined when there was none. */
  body: unknown
  /** Lower-cased names. */
  headers: Record<string, string>
  /** The matched route's `:param` values. */
  params: Record<string, string>
}

export type RouteHandler = (req: FakeRequest) => unknown
/** A JSON value (answered with 200), a `reply(...)`, or a function of the request returning either. */
export type RouteAnswer = RouteHandler | FakeReply | object | string | number | boolean | null

/** `'METHOD /path/:param'` → its answer. */
export type RouteTable = Record<string, RouteAnswer>

/** What a domain's default routes answer from: the test's data, read at request time. */
export interface FakeApiContext {
  data: FakeApiData
  /** Whose session the requests carry. */
  viewer: PersonId
  now: Date
}
