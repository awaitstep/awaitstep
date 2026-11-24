/**
 * The address other systems run workflows at, as the dashboard shows it:
 * an absolute http(s) URL with no query or fragment, without a trailing
 * slash. Anything else throws, at startup.
 */
export function checkPublicRunUrl(value: string): string {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error(`publicRunUrl must be an absolute URL, got "${value}"`)
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`publicRunUrl must be an http(s) URL, got "${value}"`)
  }
  if (url.search || url.hash || url.username || url.password) {
    throw new Error('publicRunUrl must have no query, fragment or credentials')
  }
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`
}
