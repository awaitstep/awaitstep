/**
 * The changelog page's data: every release note the dashboard's "What's new" is written from
 * (`apps/web/release-notes/*.md`), newest first. The site shows all of them; the dashboard bundles
 * only the newest 20. The front matter is the format `_template.md.example` there describes.
 */
import { RELEASES_URL } from './site'

export type ChangeTag = 'new' | 'improved' | 'fixed'

export interface Change {
  id: string
  tag: ChangeTag
  /** When it shipped, as an ISO instant in UTC. */
  date: string
  title: string
  body: string
}

export interface ChangeMonth {
  /** `2026-11`, for a stable id. */
  key: string
  /** `November 2026`. */
  label: string
  changes: Change[]
}

const TAGS: ReadonlySet<string> = new Set<ChangeTag>(['new', 'improved', 'fixed'])

/** Front matter, then the body; the dashboard's parser reads the same shape. */
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/
/** An instant with an explicit zone, as the dashboard requires, so every reader agrees on it. */
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/

/**
 * One fragment's front matter and body, or null when it is not a well-formed release note. The
 * date is read as an instant and kept in UTC, so the month a note sits under and the day it shows
 * agree whatever zone it was written in.
 */
export function parseChange(id: string, source: string): Change | null {
  // An editor's byte-order mark or a leading blank line must not hide the front matter.
  const match = FRONTMATTER.exec(source.replace(/^\uFEFF/, '').trimStart())
  if (!match) return null
  const fields = new Map<string, string>()
  for (const line of match[1].split(/\r?\n/)) {
    const at = line.indexOf(':')
    if (at > 0 && !line.trimStart().startsWith('#'))
      fields.set(line.slice(0, at).trim(), line.slice(at + 1).trim())
  }
  const tag = fields.get('tag') ?? ''
  const date = fields.get('date') ?? ''
  const title = fields.get('title') ?? ''
  const body = match[2].trim().replace(/\s*\r?\n\s*/g, ' ')
  if (!TAGS.has(tag) || !ISO_INSTANT.test(date) || Number.isNaN(Date.parse(date))) return null
  if (!title || !body) return null
  return { id, tag: tag as ChangeTag, date: new Date(date).toISOString(), title, body }
}

/** Notes newest first (same instant: by id, as the dashboard sorts them), grouped by month. */
export function groupByMonth(changes: readonly Change[]): ChangeMonth[] {
  const sorted = [...changes].sort(
    (a, b) => Date.parse(b.date) - Date.parse(a.date) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  )
  const months = new Map<string, ChangeMonth>()
  for (const change of sorted) {
    const key = change.date.slice(0, 7)
    let month = months.get(key)
    if (!month) {
      const label = new Date(`${key}-01T00:00:00Z`).toLocaleDateString('en-GB', {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      })
      month = { key, label, changes: [] }
      months.set(key, month)
    }
    month.changes.push(change)
  }
  return [...months.values()]
}

/** Reads the fragments a raw glob returns (`{ '<path>/<id>.md': source }`). */
export function loadChanges(files: Record<string, string>): Change[] {
  return Object.entries(files)
    .map(([path, source]) => parseChange(path.split('/').at(-1)!.replace(/\.md$/, ''), source))
    .filter((c): c is Change => c !== null)
}

export const TAG_LABELS: Record<ChangeTag, string> = {
  new: 'New',
  improved: 'Improved',
  fixed: 'Fixed',
}

export const CHANGELOG_PAGE = {
  title: 'Changelog | AwaitStep',
  description: 'What’s new in AwaitStep: new features, improvements and fixes, newest first.',
  heading: 'Changelog',
  line: 'What changed for people building with AwaitStep, newest first.',
  releasesLabel: 'Versions and full notes on GitHub',
  releasesUrl: RELEASES_URL,
}
