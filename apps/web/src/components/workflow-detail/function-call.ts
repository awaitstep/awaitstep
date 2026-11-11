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

/** Why a deployment can't be called: no URL, or only one the server won't call (a route's). */
export const NOT_CALLABLE = 'This deployment has no URL AwaitStep can call.'
