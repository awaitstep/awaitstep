import type { OssFeature } from '@awaitstep/ir'
import { readInstance } from '../extensions/instance-features'
import type { SessionData } from '../stores/auth-store'
import type { Organization } from '../stores/org-store'

type Fetch = (path: string, init?: RequestInit) => Promise<Response>

/** What every signed-in page's layout loads. */
export interface AuthData {
  sessionData: SessionData
  organizations: Organization[]
  /** The extensions the API instance turns on. */
  features: string[]
  /** The open-source features the API instance switches off. */
  disabled: OssFeature[]
}

/**
 * The session, the viewer's organizations and what the instance turns on and off, read
 * with the request's cookie; null when the cookie holds no session. The
 * instance answer needs no session, so it is asked beside it, not after.
 */
export async function loadAuthData(fetch: Fetch, cookie: string): Promise<AuthData | null> {
  const headers = { cookie }
  const [sessionRes, instance] = await Promise.all([
    fetch('/api/auth/get-session', { headers }),
    readInstance(fetch),
  ])
  if (!sessionRes.ok) return null

  const sessionData = (await sessionRes.json()) as { session?: unknown }
  if (!sessionData?.session) return null

  const orgsRes = await fetch('/api/auth/organization/list', { headers })
  const orgsBody = orgsRes.ok ? await orgsRes.json() : []
  const organizations: Organization[] = Array.isArray(orgsBody) ? orgsBody : []

  return { sessionData: sessionData as SessionData, organizations, ...instance }
}
