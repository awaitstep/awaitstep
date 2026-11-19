import { isExtensionId } from '@awaitstep/ir'

type Fetch = (path: string, init?: RequestInit) => Promise<Response>

/**
 * The extension ids `GET /api/instance` lists. Anything but a well-formed
 * answer — an error, a network failure, an older API without the endpoint —
 * means none: the dashboard still loads, with its own features only.
 */
export async function readInstanceFeatures(fetch: Fetch): Promise<string[]> {
  try {
    const res = await fetch('/api/instance')
    if (!res.ok) return []
    const body = (await res.json()) as { features?: unknown }
    if (!Array.isArray(body?.features)) return []
    return body.features.filter(isExtensionId)
  } catch {
    return []
  }
}
