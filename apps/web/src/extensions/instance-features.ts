import { isExtensionId, isOssFeature, type OssFeature } from '@awaitstep/ir'

type Fetch = (path: string, init?: RequestInit) => Promise<Response>

/** What `GET /api/instance` says this instance turns on and off. */
export interface InstanceInfo {
  /** Ids of the extensions it plugs in. */
  features: string[]
  /** The open-source features it switches off. */
  disabled: OssFeature[]
}

const NOTHING: InstanceInfo = { features: [], disabled: [] }

/**
 * What `GET /api/instance` lists. Anything but a well-formed answer — an
 * error, a network failure, an older API without the endpoint — means no
 * extensions and nothing switched off: the dashboard still loads, with its
 * own features only. The API still refuses what it switches off.
 */
export async function readInstance(fetch: Fetch): Promise<InstanceInfo> {
  try {
    const res = await fetch('/api/instance')
    if (!res.ok) return NOTHING
    const body = (await res.json()) as { features?: unknown; disabled?: unknown } | null
    return {
      features: Array.isArray(body?.features) ? body.features.filter(isExtensionId) : [],
      // A name this dashboard doesn't know has nothing here to hide.
      disabled: Array.isArray(body?.disabled) ? body.disabled.filter(isOssFeature) : [],
    }
  } catch {
    return NOTHING
  }
}
