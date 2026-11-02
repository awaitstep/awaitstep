import type { ReleaseNote } from '../content/releases'
import type { ReleaseTag } from '../types/dashboard/inbox'
import {
  ORG_PAGES,
  ORG_SETTINGS_PAGES,
  type OrgPage,
  type OrgSettingsPage,
} from './dashboard-paths'

/** How many notes What's new keeps; older ones fall off the bundle. */
export const RELEASE_NOTES_LIMIT = 20

const TAGS: readonly ReleaseTag[] = ['new', 'improved', 'fixed']
const KEYS = ['tag', 'date', 'title', 'link', 'linkLabel'] as const
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/
/** An instant with an explicit zone, so the server and every browser read it the same way. */
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/
/** The body is one plain paragraph: the sheet does not render Markdown. */
const MARKDOWN_IN_BODY = /\n\s*\n|\*\*|`|\]\(/

function fail(slug: string, reason: string): never {
  throw new Error(`release-notes/${slug}.md: ${reason}`)
}

function readFields(slug: string, raw: string): { fields: Map<string, string>; body: string } {
  // An editor's byte-order mark or a leading blank line must not hide the frontmatter.
  const match = FRONTMATTER.exec(raw.replace(/^\uFEFF/, '').trimStart())
  if (!match) return fail(slug, 'missing frontmatter (--- ... ---)')
  const fields = new Map<string, string>()
  for (const line of match[1]!.split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue
    const colon = line.indexOf(':')
    if (colon < 1) return fail(slug, `frontmatter line "${line}" is not "key: value"`)
    const key = line.slice(0, colon).trim()
    if (!(KEYS as readonly string[]).includes(key)) return fail(slug, `unknown key "${key}"`)
    if (fields.has(key)) return fail(slug, `duplicate key "${key}"`)
    const value = line.slice(colon + 1).trim()
    if (/^(".*"|'.*')$/.test(value)) return fail(slug, `${key} must not be wrapped in quotes`)
    fields.set(key, value)
  }
  return { fields, body: match[2]!.trim() }
}

function readLink(slug: string, link: string | undefined): ReleaseNote['link']['page'] {
  if (!link) return fail(slug, 'link is required')
  if (link.startsWith('settings/')) {
    const section = link.slice('settings/'.length)
    if (!(ORG_SETTINGS_PAGES as readonly string[]).includes(section))
      return fail(slug, `unknown settings section "${section}"`)
    return { settings: section as OrgSettingsPage }
  }
  if (!(ORG_PAGES as readonly string[]).includes(link)) return fail(slug, `unknown page "${link}"`)
  return link as OrgPage
}

/** One fragment file to a release note, its id the file's slug. Throws, naming the file, on anything invalid. */
export function parseFragment(slug: string, raw: string): ReleaseNote {
  const { fields, body } = readFields(slug, raw)
  const tag = fields.get('tag')
  if (!tag || !(TAGS as readonly string[]).includes(tag)) return fail(slug, `unknown tag "${tag}"`)
  const date = fields.get('date')
  if (!date || !ISO_INSTANT.test(date) || Number.isNaN(Date.parse(date)))
    return fail(slug, `bad date "${date}" (want 2026-10-30T12:00:00.000Z)`)
  const title = fields.get('title')
  if (!title) return fail(slug, 'title is required')
  if (!body) return fail(slug, 'body is required')
  if (MARKDOWN_IN_BODY.test(body))
    return fail(slug, 'body is one plain-text paragraph: no Markdown, no blank lines')
  const label = fields.get('linkLabel')
  if (!label) return fail(slug, 'linkLabel is required')
  return {
    id: slug,
    tag: tag as ReleaseTag,
    date: new Date(date).toISOString(),
    title,
    body: body.replace(/\s*\r?\n\s*/g, ' '),
    link: { label, page: readLink(slug, fields.get('link')) },
  }
}

/**
 * Fragment files (path to raw text) to the newest `limit` notes, newest first,
 * equal dates by id. A fragment that does not parse is handed to `onInvalid`
 * and left out; without one it throws, so tests fail loudly.
 */
export function loadReleaseNotes(
  files: Record<string, string>,
  limit: number = RELEASE_NOTES_LIMIT,
  onInvalid?: (error: Error) => void,
): ReleaseNote[] {
  const notes: ReleaseNote[] = []
  for (const [path, raw] of Object.entries(files)) {
    try {
      notes.push(parseFragment(path.replace(/^.*\//, '').replace(/\.md$/, ''), raw))
    } catch (error) {
      if (!onInvalid) throw error
      onInvalid(error as Error)
    }
  }
  return notes
    .sort(
      (a, b) => Date.parse(b.date) - Date.parse(a.date) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    )
    .slice(0, limit)
}
