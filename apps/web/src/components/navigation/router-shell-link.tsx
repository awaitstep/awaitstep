import { Link } from '@tanstack/react-router'
import type { ShellLinkProps } from '../ui/shell-link'

export type RouterTarget =
  | {
      kind: 'router'
      to: string
      search: Record<string, string> | undefined
      hash: string | undefined
    }
  | { kind: 'anchor' }

/**
 * How an href is followed: in-app paths (`/…`) through the router, split into
 * path, query and fragment; anything else — other sites, protocol-relative
 * `//host` — as a plain anchor.
 */
export function routerTarget(href: string): RouterTarget {
  if (!href.startsWith('/') || href.startsWith('//')) return { kind: 'anchor' }
  const hashAt = href.indexOf('#')
  const beforeHash = hashAt === -1 ? href : href.slice(0, hashAt)
  const hash = hashAt === -1 ? undefined : href.slice(hashAt + 1) || undefined
  const queryAt = beforeHash.indexOf('?')
  const to = queryAt === -1 ? beforeHash : beforeHash.slice(0, queryAt)
  const query = queryAt === -1 ? '' : beforeHash.slice(queryAt + 1)
  const search = query ? Object.fromEntries(new URLSearchParams(query)) : undefined
  return { kind: 'router', to, search, hash }
}

/**
 * The link the dashboard gives the kit: a router `Link` for in-app paths, so
 * navigation stays client-side and the layout's search middleware keeps
 * `?mock=` / `?as=`; a plain anchor for anything else.
 */
export function RouterShellLink({ href, ...props }: ShellLinkProps) {
  const target = routerTarget(href)
  if (target.kind === 'anchor') return <a href={href} {...props} />
  return <Link to={target.to} search={target.search} hash={target.hash} {...props} />
}
