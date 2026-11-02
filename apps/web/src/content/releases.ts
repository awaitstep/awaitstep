import type { OrgPage, OrgSettingsPage } from '../lib/dashboard-paths'
import type { ReleaseTag } from '../types/dashboard/inbox'
import { loadReleaseNotes, RELEASE_NOTES_LIMIT } from '../lib/release-note-fragments'

/** A release note as written here; `lib/release-feed.ts` puts it in an org's What's new. */
export interface ReleaseNote {
  id: string
  tag: ReleaseTag
  /** ISO time it shipped. */
  date: string
  title: string
  body: string
  /** Where "learn more" goes, in the org What's new is open in. */
  link: { label: string; page: OrgPage | { settings: OrgSettingsPage } }
}

/**
 * What's new (B8): hand-written for people using the dashboard — not the
 * commit log — one fragment per note in `release-notes/` (see
 * `_template.md.example`), written in the PR that ships it. The newest
 * `RELEASE_NOTES_LIMIT` are bundled at build time; a self-hosted instance
 * shows the notes of the version it runs.
 */
export const RELEASE_NOTES: ReleaseNote[] = loadReleaseNotes(
  import.meta.glob('../../release-notes/*.md', {
    query: '?raw',
    import: 'default',
    eager: true,
  }),
  RELEASE_NOTES_LIMIT,
  // One bad fragment must not take down every dashboard page; the tests fail on it instead.
  (error) => console.error(error.message),
)
