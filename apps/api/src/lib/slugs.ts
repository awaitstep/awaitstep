import { z } from 'zod'
import { MAX_SLUG_LENGTH, SLUG_PATTERN, isReservedSlug, type SlugLevel } from '@awaitstep/ir'

// One slug rule for every create and rename: the shape, the length, and the
// pages a route already owns at that level (`@awaitstep/ir` holds the lists
// the dashboard router hides, so the two can't drift).

function slugSchema(level: SlugLevel) {
  return z
    .string()
    .min(1)
    .max(MAX_SLUG_LENGTH)
    .regex(SLUG_PATTERN, 'Slug must be lowercase letters, digits, and hyphens')
    .refine((slug) => !isReservedSlug(level, slug), {
      message: 'That URL is taken by a page. Pick another',
    })
}

export const orgSlugSchema = slugSchema('org')
export const projectSlugSchema = slugSchema('project')
export const workspaceSlugSchema = slugSchema('workspace')

/**
 * The message for an organization slug better-auth is about to store, or
 * null when it is fine. Organization slugs are global and sit first in every
 * dashboard URL, so the shape and the reserved list apply as for projects.
 */
export function orgSlugProblem(slug: unknown): string | null {
  if (typeof slug !== 'string') return 'An organization needs a URL'
  const parsed = orgSlugSchema.safeParse(slug)
  return parsed.success ? null : (parsed.error.issues[0]?.message ?? 'Invalid URL')
}
