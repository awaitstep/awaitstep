/** What a deploy says about where its worker answers. */
export interface WorkerAddresses {
  /** Wrangler's output: it prints the workers.dev address when that is on. */
  stdout: string
  routes?: ReadonlyArray<{ pattern: string }>
  customDomains?: readonly string[]
}

const HOST = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9-]{2,63}$/i

/**
 * The URL a route pattern's requests reach the worker at, or null when no
 * single URL does: a wildcard host (`*.acme.com/*`), or a `*` anywhere but
 * the end of the path. `wf.acme.com/v1/x/*` → `https://wf.acme.com/v1/x/`:
 * the trailing slash keeps the URL inside the route.
 */
export function routeUrl(pattern: string): string | null {
  const trimmed = pattern.trim().replace(/^https?:\/\//i, '')
  const slash = trimmed.indexOf('/')
  const host = slash === -1 ? trimmed : trimmed.slice(0, slash)
  const path = slash === -1 ? '/' : trimmed.slice(slash)
  if (!HOST.test(host)) return null
  const base = path.endsWith('*') ? path.slice(0, -1) : path
  if (base.includes('*') || /[?#\s]/.test(base)) return null
  return `https://${host.toLowerCase()}${base === '' ? '/' : base}`
}

/** A custom domain's URL, or null when it isn't a plain host name. */
function domainUrl(domain: string): string | null {
  const host = domain
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/$/, '')
  return HOST.test(host) ? `https://${host.toLowerCase()}/` : null
}

/**
 * The URL a deploy is recorded at, the one AwaitStep calls: the first custom
 * domain, else the first route with a single URL, else the workers.dev
 * address wrangler printed (only there when it was turned on). Undefined when
 * none is usable: the worker is reached only through Cloudflare's API.
 */
export function deployedWorkerUrl(addresses: WorkerAddresses): string | undefined {
  for (const domain of addresses.customDomains ?? []) {
    const url = domainUrl(domain)
    if (url) return url
  }
  for (const route of addresses.routes ?? []) {
    const url = routeUrl(route.pattern)
    if (url) return url
  }
  return addresses.stdout.match(/https:\/\/[^\s)]+\.workers\.dev/)?.[0]
}
