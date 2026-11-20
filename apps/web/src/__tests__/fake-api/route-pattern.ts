export interface RoutePattern {
  /** As written: `DELETE /account/sessions/:id`. */
  source: string
  method: string
  segments: string[]
}

/** `'GET /account/sessions/:id'` → its method and path segments; a `:name` segment matches any one. */
export function parseRoute(route: string): RoutePattern {
  const match = /^([A-Z]+) (\/\S*)$/.exec(route.trim())
  if (!match) {
    throw new Error(`Fake API: write a route as "METHOD /path/:param", not "${route}"`)
  }
  const [, method, path] = match as unknown as [string, string, string]
  if (path.includes('?')) {
    throw new Error(
      `Fake API: "${route}" has a query; routes match the path, handlers read req.query`,
    )
  }
  return { source: route, method, segments: splitPath(path) }
}

function splitPath(path: string): string[] {
  return path.split('/').filter((segment) => segment !== '')
}

/** The `:param` values when `method path` is this route, or null. */
export function matchRoute(
  pattern: RoutePattern,
  method: string,
  path: string,
): Record<string, string> | null {
  if (pattern.method !== method) return null
  const segments = splitPath(path)
  if (segments.length !== pattern.segments.length) return null
  const params: Record<string, string> = {}
  for (const [i, expected] of pattern.segments.entries()) {
    const actual = decodeURIComponent(segments[i]!)
    if (expected.startsWith(':')) params[expected.slice(1)] = actual
    else if (expected !== actual) return null
  }
  return params
}
