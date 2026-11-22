import { sendEventBody } from '@awaitstep/codegen'

// How the API reshapes a run's request: a new instance id, and the caller's
// query string on the deployment's URL. What the request means (the
// instance id it names, the send-event body) is `@awaitstep/codegen`'s.

/** A new instance id for a run AwaitStep starts. */
export function freshInstanceId(): string {
  return crypto.randomUUID()
}

/**
 * The payload with a new instance id in place of the one it named, for Run
 * again. A send-event body keeps its id: it names the run it resumes.
 */
export function withFreshInstanceId(params: unknown): unknown {
  if (params === null || typeof params !== 'object' || Array.isArray(params)) return params
  const record = params as Record<string, unknown>
  if (typeof record['instanceId'] !== 'string' || sendEventBody(params)) return params
  return { ...record, instanceId: freshInstanceId() }
}

/** The deployment's URL with the caller's query string added to its own. */
export function withQuery(url: string, query: string | undefined): string {
  if (!query) return url
  const target = new URL(url)
  for (const [key, value] of new URLSearchParams(query)) target.searchParams.append(key, value)
  return target.toString()
}
