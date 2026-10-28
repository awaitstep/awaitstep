import { MAX_SLUG_LENGTH, isReservedSlug, type SlugLevel } from '@awaitstep/ir'

/**
 * `base`, suffixed `-2`, `-3`… until no sibling uses it and no dashboard page
 * owns it. A suffixed slug stays within the length cap, so a long name gives
 * `…-2`, not a slug the API refuses.
 */
export function availableSlug(
  level: SlugLevel,
  base: string,
  takenBySibling: (slug: string) => boolean,
): string {
  const free = (slug: string) => !isReservedSlug(level, slug) && !takenBySibling(slug)
  if (free(base)) return base
  for (let n = 2; ; n++) {
    const suffix = `-${n}`
    const slug = `${base.slice(0, MAX_SLUG_LENGTH - suffix.length).replace(/-+$/, '')}${suffix}`
    if (free(slug)) return slug
  }
}
