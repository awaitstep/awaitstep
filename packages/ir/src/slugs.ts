// URL slugs for organizations, projects and workspaces. The dashboard builds
// `/{org}/{project}/{workspace}/{page}` from them, so the API, the dashboard
// and the dummy server share one definition of what a slug may be.

/** Lowercase letters, digits and inner hyphens: `my-project`, `a`, `v2`. */
export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/

export const MAX_SLUG_LENGTH = 100

export type SlugLevel = 'org' | 'project' | 'workspace'

/**
 * Slugs a URL segment at each level can't be, because a route already owns
 * that path: the old app's top-level pages at the org level, the org's own
 * pages at the project level, and the project's own pages
 * (`/{org}/{project}/workspaces`, `/members`, `/settings`…) at the workspace level. The dashboard's path builders assert their page names are
 * all in here, so a new page can't silently shadow a slug.
 */
export const RESERVED_SLUGS = {
  org: [
    'api',
    'account',
    'api-playground',
    'choose-org',
    'connections',
    'dashboard',
    'invite',
    'runs',
    'settings',
    'sign-in',
    'workflows',
  ],
  project: [
    'projects',
    'resources',
    'audit',
    'connections',
    'api-keys',
    'inbox',
    'whats-new',
    'settings',
    'account',
    'items',
  ],
  workspace: [
    'workspaces',
    'shared',
    'members',
    'connections',
    'api-keys',
    'variables',
    'settings',
  ],
} as const satisfies Record<SlugLevel, readonly string[]>

export function isReservedSlug(level: SlugLevel, slug: string): boolean {
  return (RESERVED_SLUGS[level] as readonly string[]).includes(slug)
}

/** Whether `slug` has the right shape and shadows no page at `level`. */
export function isValidSlug(level: SlugLevel, slug: string): boolean {
  return slug.length <= MAX_SLUG_LENGTH && SLUG_PATTERN.test(slug) && !isReservedSlug(level, slug)
}

/**
 * `"My Project!"` → `"my-project"`. Empty when nothing usable is left, unless
 * a `fallback` is given — callers that must not land on a surprise slug
 * (`/default`) pass none and refuse the input instead.
 */
export function slugify(name: string, fallback = ''): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .slice(0, MAX_SLUG_LENGTH)
      .replace(/^-+|-+$/g, '') || fallback
  )
}
