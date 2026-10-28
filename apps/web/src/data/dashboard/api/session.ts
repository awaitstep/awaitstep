import { initialsOf } from '../../../lib/initials'
import type { Viewer } from '../../../types/dashboard/session'

/** The signed-in person, from the session the app already holds. */
export function viewerFromUser(
  user: { id: string; name?: string | null; email: string; image?: string | null } | null,
  lastOrgSlug: string | null,
): Viewer {
  if (!user) throw new Error('No session')
  return {
    id: user.id,
    name: user.name?.trim() || user.email,
    email: user.email,
    initials: initialsOf(user.name, user.email),
    image: user.image ?? null,
    lastOrgSlug,
  }
}
