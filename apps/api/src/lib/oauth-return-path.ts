// Where the Cloudflare OAuth callback sends the browser back. Self-hosted
// returns to the Connections page the flow started from; a wrapping workspace
// that hides that page names its own, as a path template in the web app.

/** Today's pages: the org's Connections, or the project's when the flow named one. */
export const DEFAULT_OAUTH_RETURN_PATH = '/{org}/{project}/connections'

const PLACEHOLDER = /\{([^}]*)\}/g
const KNOWN = new Set(['org', 'project'])

/**
 * Refuses a return path that could send the browser anywhere but a page of
 * the web app: it must start with one `/`, name `{org}`, use no other
 * placeholder, and carry no query or fragment (the callback adds its result as
 * the query). Throws at startup, so a mistake never reaches a callback.
 */
export function checkOAuthReturnPath(template: string): string {
  const fail = (why: string): never => {
    throw new Error(`OAuth return path "${template}" is not valid: ${why}.`)
  }
  if (!template.startsWith('/') || template.startsWith('//') || template.includes('\\')) {
    fail('it must be a path in the web app, starting with a single /')
  }
  if (/[?#\s]/.test(template)) fail('it must have no query, fragment or spaces')
  for (const [, name] of template.matchAll(PLACEHOLDER)) {
    if (!KNOWN.has(name!)) fail(`{${name}} is not a placeholder; use {org} and {project}`)
  }
  if (!template.includes('{org}')) fail('it must name {org}')
  return template
}

/**
 * The page the callback returns to: the template with the org's (and the
 * project's) slug in place, below the web app's origin, with `params` as the
 * query. A `{project}` with no project in the flow drops out with its slash.
 */
export function oauthReturnUrl(
  webUrl: string,
  template: string,
  slugs: { org: string; project?: string },
  params: Record<string, string>,
): string {
  const base = webUrl.replace(/\/+$/, '')
  const path = template
    .replaceAll('{org}', encodeURIComponent(slugs.org))
    .replaceAll('{project}', slugs.project ? encodeURIComponent(slugs.project) : '')
    .replace(/\/{2,}/g, '/')
  const query = new URLSearchParams(params).toString()
  return `${base}${path}?${query}`
}
