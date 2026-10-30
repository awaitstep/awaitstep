import type { ReleaseNote } from '../content/releases'
import type { ReleaseFeed } from '../types/dashboard/inbox'
import { orgPath, orgSettingsPath } from './dashboard-paths'

/**
 * What's new in one org: every note, links kept in the org, "New to you"
 * for every note the person hasn't seen (all of them, if they never
 * looked). Seen by id, not by date: a note reaches people when their build
 * does, which may be well after the date written on it.
 */
export function releaseFeed(
  org: string,
  notes: readonly ReleaseNote[],
  visit: { lastVisit: string | null; seen: readonly string[] },
): ReleaseFeed {
  const seen = new Set(visit.seen)
  return {
    releases: notes.map((note) => {
      const page = note.link.page
      return {
        id: note.id,
        tag: note.tag,
        date: note.date,
        title: note.title,
        body: note.body,
        link: {
          label: note.link.label,
          href: typeof page === 'string' ? orgPath(org, page) : orgSettingsPath(org, page.settings),
        },
        fresh: visit.lastVisit === null || !seen.has(note.id),
      }
    }),
    lastVisit: visit.lastVisit,
  }
}
