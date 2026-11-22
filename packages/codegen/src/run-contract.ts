// What a run request means, whichever way it reaches the workflow: the
// instance id it names, and the built-in send-event body. The API reads it
// to start a run through the provider's API; a provider's generated worker
// reads the same header and body.

/**
 * The header a run through the workflow's own URL names its instance id in;
 * the generated worker hands it to the first instance the request starts.
 */
export const INSTANCE_ID_HEADER = 'X-AwaitStep-Instance-Id'

/** An instance id AwaitStep takes: up to 100 letters, digits, `-` or `_`, not starting with `-`. */
const INSTANCE_ID = /^[A-Za-z0-9_][A-Za-z0-9_-]{0,99}$/
/** An event type as a wait takes one: up to 100 letters, digits, `-` or `_`. */
const EVENT_TYPE = /^[A-Za-z0-9_-]{1,100}$/

export const BAD_INSTANCE_ID =
  'instanceId must be up to 100 letters, digits, - or _, not starting with -'
export const BAD_EVENT_TYPE = 'type must be up to 100 letters, digits, - or _'

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

/**
 * The instance id the body names (`instanceId`), null when it names none, or
 * an error for one that can't be an instance id. It stays in the params.
 */
export function namedInstanceId(
  params: unknown,
): { ok: true; instanceId: string | null } | { ok: false; error: string } {
  const named = asRecord(params)?.['instanceId']
  if (named === undefined || named === null) return { ok: true, instanceId: null }
  if (typeof named !== 'string' || !INSTANCE_ID.test(named)) {
    return { ok: false, error: BAD_INSTANCE_ID }
  }
  return { ok: true, instanceId: named }
}

export type SendEventBody =
  { ok: true; instanceId: string; type: string; payload: unknown } | { ok: false; error: string }

/**
 * The built-in send-event request — `{ action: "send-event", instanceId,
 * type, payload }` in the body, or `?action=send-event&instanceId=…&type=…`
 * with the body as the payload — or null for any other request. `params`
 * is taken for the payload too.
 */
export function sendEventBody(params: unknown, query?: URLSearchParams): SendEventBody | null {
  const body = asRecord(params)
  const queryAction = query?.get('action') === 'send-event'
  if (body?.['action'] !== 'send-event' && !queryAction) return null
  const instanceId = body?.['instanceId'] ?? query?.get('instanceId')
  if (typeof instanceId !== 'string' || instanceId.trim() === '') {
    return { ok: false, error: 'instanceId is required' }
  }
  if (!INSTANCE_ID.test(instanceId)) return { ok: false, error: BAD_INSTANCE_ID }
  const type = body?.['type'] ?? query?.get('type')
  if (typeof type !== 'string' || type.trim() === '') {
    return { ok: false, error: 'type is required' }
  }
  if (!EVENT_TYPE.test(type)) return { ok: false, error: BAD_EVENT_TYPE }
  const payload = body?.['params'] ?? body?.['payload'] ?? (queryAction ? params : undefined)
  return { ok: true, instanceId, type, payload }
}
