import type { FunctionCallRequest, FunctionCallResult } from '@awaitstep/codegen'

/** How long a call may take before the dashboard gives up on it. */
export const CALL_TIMEOUT_MS = 30_000

/** How much of the answer is read back; the rest is cut. */
export const CALL_MAX_BYTES = 100 * 1024

export const NOT_CALLABLE = 'Only a workers.dev URL can be called from here.'

/**
 * Whether the server may POST to a deployed function's URL. Only its own
 * `https://<name>.workers.dev` address: a route or custom-domain URL comes
 * from a pattern a user typed, and could point the server at any host.
 */
export function isCallableUrl(raw: string): boolean {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return false
  }
  return (
    url.protocol === 'https:' &&
    url.port === '' &&
    url.username === '' &&
    url.password === '' &&
    url.hostname.endsWith('.workers.dev')
  )
}

async function readCapped(
  response: Response,
  maxBytes: number,
): Promise<{ bytes: Uint8Array; text: string; truncated: boolean }> {
  const reader = response.body?.getReader()
  if (!reader) return { bytes: new Uint8Array(), text: '', truncated: false }
  const chunks: Uint8Array[] = []
  let size = 0
  let truncated = false
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    const room = maxBytes - size
    if (value.byteLength > room) {
      chunks.push(value.subarray(0, room))
      truncated = true
      await reader.cancel().catch(() => undefined)
      break
    }
    chunks.push(value)
    size += value.byteLength
  }
  const joined = new Uint8Array(chunks.reduce((n, c) => n + c.byteLength, 0))
  let at = 0
  for (const chunk of chunks) {
    joined.set(chunk, at)
    at += chunk.byteLength
  }
  return { bytes: joined, text: new TextDecoder().decode(joined), truncated }
}

/**
 * Calls a deployed function: POSTs the body to its workers.dev URL and reads
 * back its answer (status, time, body up to {@link CALL_MAX_BYTES}). A
 * redirect is answered as is, never followed — it could lead anywhere.
 */
export async function callFunction(
  request: FunctionCallRequest,
  fetcher: typeof fetch = fetch,
  timeoutMs = CALL_TIMEOUT_MS,
): Promise<FunctionCallResult> {
  if (!isCallableUrl(request.url)) return { ok: false, kind: 'refused', reason: NOT_CALLABLE }

  const started = Date.now()
  try {
    const response = await fetcher(request.url, {
      method: 'POST',
      headers: { 'content-type': request.contentType ?? 'application/json' },
      // A caller's bytes go on as they came.
      body: request.body as BodyInit,
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    })
    const { bytes, text, truncated } = await readCapped(response, CALL_MAX_BYTES)
    return {
      ok: true,
      status: response.status,
      statusText: response.statusText,
      durationMs: Date.now() - started,
      contentType: response.headers.get('content-type'),
      body: text,
      bytes,
      location: response.headers.get('location'),
      truncated,
    }
  } catch (err) {
    const timedOut = err instanceof Error && err.name === 'TimeoutError'
    return {
      ok: false,
      kind: 'failed',
      reason: timedOut
        ? `The function didn’t answer within ${Math.round(timeoutMs / 1000)} s.`
        : 'Couldn’t reach the function.',
    }
  }
}
