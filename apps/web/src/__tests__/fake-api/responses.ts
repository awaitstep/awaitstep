const REPLY = Symbol('fake-api reply')

/** An answer with a status other than 200, or with headers. A plain value answers 200 with it. */
export interface FakeReply {
  [REPLY]: true
  status: number
  body: unknown
  headers: Record<string, string>
}

export function reply(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): FakeReply {
  return { [REPLY]: true, status, body, headers }
}

export function isReply(value: unknown): value is FakeReply {
  return typeof value === 'object' && value !== null && REPLY in value
}

/** The API's refusal: `{ error }`, plus a `field` or anything else the route adds. */
export function apiError(
  status: number,
  error: string,
  extra: Record<string, unknown> = {},
): FakeReply {
  return reply(status, { error, ...extra })
}

/** better-auth's refusal (`/auth/*` routes): `{ message, code }`. */
export function authError(status: number, message: string, code?: string): FakeReply {
  return reply(status, code ? { message, code } : { message })
}

/** An answer that never comes: the page stays loading. */
export function pending(): Promise<never> {
  return new Promise<never>(() => {})
}
