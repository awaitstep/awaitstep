// GitHub and Google avatars stay the URLs the providers gave at sign-up:
// they are not copied into the store. These two hosts are the only remote
// images the dashboard loads, and its `img-src` names them.

export const PROVIDER_IMAGE_HOSTS = ['avatars.githubusercontent.com', 'lh3.googleusercontent.com']

/** An https URL on one of the provider hosts. */
export function isProviderImageUrl(value: string): boolean {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }
  return url.protocol === 'https:' && !url.port && PROVIDER_IMAGE_HOSTS.includes(url.hostname)
}

/** Where node icons come from when no registry is configured: the public registry's host. */
export const DEFAULT_REGISTRY_URL =
  'https://raw.githubusercontent.com/awaitstep/awaitstep/main/registry'

function originOf(url: string): string | null {
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

/**
 * The dashboard's image policy: its own images, the provider avatars, the
 * node registry's icons (`registryUrl`'s origin), and `data:`/`blob:` for a
 * picked file's preview before it is uploaded.
 */
export function dashboardImgSrc(registryUrl: string = DEFAULT_REGISTRY_URL): string {
  const hosts = PROVIDER_IMAGE_HOSTS.map((host) => `https://${host}`)
  const registry = originOf(registryUrl)
  const origins = registry && !hosts.includes(registry) ? [...hosts, registry] : hosts
  return `img-src 'self' data: blob: ${origins.join(' ')}`
}
