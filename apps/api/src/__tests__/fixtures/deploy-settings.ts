/**
 * The settings snapshot a deploy recorded at `serviceUrl` went out with, as a
 * real deploy stores it: a route for a URL with a path, a custom domain for a
 * bare host. A workers.dev address (or none) needs no settings to be trusted.
 */
export function settingsFor(serviceUrl: string | undefined | null): string | undefined {
  if (!serviceUrl) return undefined
  let url: URL
  try {
    url = new URL(serviceUrl)
  } catch {
    return undefined
  }
  if (url.hostname.endsWith('.workers.dev')) return undefined
  return JSON.stringify(
    url.pathname === '/'
      ? { customDomains: [url.hostname] }
      : { routes: [{ pattern: `${url.hostname}${url.pathname}*`, zoneName: url.hostname }] },
  )
}
