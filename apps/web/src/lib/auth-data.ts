import { readInstanceFeatures } from '../extensions/instance-features'
import type { SessionData } from '../stores/auth-store'
import type { Organization } from '../stores/org-store'

type Fetch = (path: string, init?: RequestInit) => Promise<Response>

/** What every signed-in page's layout loads. */
export interface AuthData {
  sessionData: SessionData
  organizations: Organization[]
  /** The extensions the API instance turns on. */
  features: string[]
}

/**
 * The session, the viewer's organizations and the instance's features, read
 * with the request's cookie; null when the cookie holds no session. The
 * instance answer needs no session, so it is asked beside it, not after.
 */
export async function loadAuthData(fetch: Fetch, cookie: string): Promise<AuthData | null> {
  const headers = { cookie }
  const [sessionRes, features] = await Promise.all([
    fetch('/api/auth/get-session', { headers }),
    readInstanceFeatures(fetch),
  ])
  if (!sessionRes.ok) return null

  const sessionData = (await sessionRes.json()) as { session?: unknown }
  if (!sessionData?.session) return null

  const orgsRes = await fetch('/api/auth/organization/list', { headers })
  const orgsBody = orgsRes.ok ? await orgsRes.json() : []
  const organizations: Organization[] = Array.isArray(orgsBody) ? orgsBody : []

  return { sessionData: sessionData as SessionData, organizations, features }
}
