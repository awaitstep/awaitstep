/**
 * One encoded path segment. An empty value, `.` and `..` are refused: an empty
 * one drops its segment, and encoding leaves dots alone, which the URL parser
 * collapses into another route (`%2e%2e` collapses too).
 */
export function pathSegment(value: string | number): string {
  const segment = String(value)
  if (segment === '' || segment === '.' || segment === '..') {
    throw new Error(
      segment ? `“${segment}” can’t be part of an address` : 'An address part can’t be empty',
    )
  }
  return encodeURIComponent(segment)
}

/**
 * An API path whose interpolated values are each one encoded path segment:
 * `` apiPath`/workspaces/${id}/members` `` — an id holding `/`, `?`, `#` or
 * dots stays inside its segment instead of reaching another route.
 */
export function apiPath(strings: TemplateStringsArray, ...values: (string | number)[]): string {
  return strings.reduce(
    (path, part, i) => path + part + (i < values.length ? pathSegment(values[i]!) : ''),
    '',
  )
}
