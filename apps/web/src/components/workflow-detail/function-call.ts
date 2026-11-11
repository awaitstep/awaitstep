/** Why the body can't be sent as JSON, or null when it can (an empty body sends as is). */
export function jsonProblem(body: string): string | null {
  if (body.trim() === '') return null
  try {
    JSON.parse(body)
    return null
  } catch (err) {
    return err instanceof Error ? err.message : 'Not valid JSON'
  }
}

/** A JSON answer indented to read; anything else as it came. */
export function prettyBody(body: string, contentType: string | null): string {
  if (!contentType?.includes('json')) return body
  try {
    return JSON.stringify(JSON.parse(body), null, 2)
  } catch {
    return body
  }
}

function shellQuote(text: string): string {
  return `'${text.replace(/'/g, `'\\''`)}'`
}

/** The curl that makes the same call, URL and body quoted for a POSIX shell. */
export function curlFor(url: string, body: string): string {
  return `curl -X POST ${shellQuote(url)} -H 'content-type: application/json' -d ${shellQuote(body)}`
}

/**
 * Why Send can't go to this deployment, or null when it can: it has no URL,
 * or one the provider won't call from the server (its `callableUrlPattern`).
 */
export function notCallableReason(url: string | null, callablePattern?: string): string | null {
  if (!url) return 'This deployment has no URL to call.'
  if (callablePattern && !new RegExp(callablePattern, 'i').test(url)) {
    return 'This deployment’s URL can’t be called from here, only the function’s own address.'
  }
  return null
}
