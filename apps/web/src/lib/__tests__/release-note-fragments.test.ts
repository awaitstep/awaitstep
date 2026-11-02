import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { RELEASE_NOTES } from '../../content/releases'
import { loadReleaseNotes, parseFragment, RELEASE_NOTES_LIMIT } from '../release-note-fragments'

function fragment(overrides: Record<string, string> = {}, body = 'What changed.'): string {
  const fields = {
    tag: 'new',
    date: '2026-10-30T12:00:00.000Z',
    title: 'Audit log',
    link: 'audit',
    linkLabel: 'Open audit log',
    ...overrides,
  }
  const lines = Object.entries(fields).map(([key, value]) => `${key}: ${value}`)
  return `---\n${lines.join('\n')}\n---\n${body}\n`
}

describe('parseFragment', () => {
  it('reads a fragment into a note whose id is the file slug', () => {
    expect(parseFragment('rel_audit', fragment())).toEqual({
      id: 'rel_audit',
      tag: 'new',
      date: '2026-10-30T12:00:00.000Z',
      title: 'Audit log',
      body: 'What changed.',
      link: { label: 'Open audit log', page: 'audit' },
    })
  })

  it('reads a settings link as a settings destination', () => {
    expect(parseFragment('x', fragment({ link: 'settings/members' })).link.page).toEqual({
      settings: 'members',
    })
  })

  it('keeps a colon inside a value', () => {
    expect(parseFragment('x', fragment({ title: 'Heads up: new keys' })).title).toBe(
      'Heads up: new keys',
    )
  })

  it.each([
    ['an unknown tag', { tag: 'shiny' }, 'unknown tag'],
    ['a bad date', { date: 'last week' }, 'bad date'],
    ['a bare number as a date', { date: '1' }, 'bad date'],
    ['a date without a zone', { date: '2026-10-30 12:00' }, 'bad date'],
    ['a date-only value', { date: '2026-10-30' }, 'bad date'],
    ['a quoted title', { title: '"Audit log"' }, 'must not be wrapped in quotes'],
    ['an unknown key', { titel: 'Audit log' }, 'unknown key "titel"'],
    ['an empty title', { title: '' }, 'title is required'],
    ['an unknown page', { link: 'nowhere' }, 'unknown page "nowhere"'],
    ['an unknown settings section', { link: 'settings/billing' }, 'unknown settings section'],
    ['an empty link label', { linkLabel: '' }, 'linkLabel is required'],
  ])('rejects %s, naming the file', (_name, overrides, message) => {
    expect(() => parseFragment('rel_bad', fragment(overrides))).toThrow(
      new RegExp(`release-notes/rel_bad\\.md: .*${message}`),
    )
  })

  it('stores the date as a UTC instant, whatever zone it was written in', () => {
    expect(parseFragment('x', fragment({ date: '2026-10-30T12:00:00+02:00' })).date).toBe(
      '2026-10-30T10:00:00.000Z',
    )
  })

  it('reads a fragment saved with a BOM, CRLF line endings or a leading blank line', () => {
    const crlf = fragment().replace(/\n/g, '\r\n')
    expect(parseFragment('x', `\uFEFF${crlf}`).title).toBe('Audit log')
    expect(parseFragment('x', `\n\n${crlf}`).body).toBe('What changed.')
  })

  it('skips # comment lines in the frontmatter', () => {
    const raw = fragment().replace('---\n', '---\n# a note to authors\n')
    expect(parseFragment('x', raw).title).toBe('Audit log')
  })

  it('rejects a duplicate key', () => {
    const raw = fragment().replace('title: Audit log', 'title: Audit log\ntitle: Again')
    expect(() => parseFragment('x', raw)).toThrow('duplicate key "title"')
  })

  it.each([
    ['bold', 'This is **big**.'],
    ['code', 'Use `pnpm dev`.'],
    ['a link', 'See [the docs](https://x.dev).'],
    ['two paragraphs', 'One.\n\nTwo.'],
  ])('rejects Markdown in the body: %s', (_name, body) => {
    expect(() => parseFragment('x', fragment({}, body))).toThrow('plain-text paragraph')
  })

  it('joins a body wrapped over several lines into one paragraph', () => {
    expect(parseFragment('x', fragment({}, 'First half\nsecond half.')).body).toBe(
      'First half second half.',
    )
  })

  it('rejects an empty body and a missing frontmatter', () => {
    expect(() => parseFragment('x', fragment({}, ''))).toThrow('body is required')
    expect(() => parseFragment('x', 'just text')).toThrow('missing frontmatter')
  })
})

describe('loadReleaseNotes', () => {
  it('leaves out an invalid fragment and reports it when given a handler', () => {
    const reported: string[] = []
    const notes = loadReleaseNotes(
      { '/r/ok.md': fragment(), '/r/bad.md': fragment({ tag: 'shiny' }) },
      RELEASE_NOTES_LIMIT,
      (error) => reported.push(error.message),
    )
    expect(notes.map((n) => n.id)).toEqual(['ok'])
    expect(reported).toEqual([expect.stringContaining('release-notes/bad.md')])
  })

  it('throws on an invalid fragment without a handler', () => {
    expect(() => loadReleaseNotes({ '/r/bad.md': fragment({ tag: 'shiny' }) })).toThrow('bad.md')
  })

  it('orders equal dates by code point, not locale', () => {
    const notes = loadReleaseNotes({ '/r/aa.md': fragment(), '/r/Ab.md': fragment() })
    expect(notes.map((n) => n.id)).toEqual(['Ab', 'aa'])
  })

  it('lists the newest first, ties by id', () => {
    const notes = loadReleaseNotes({
      '/r/old.md': fragment({ date: '2026-10-01T00:00:00.000Z' }),
      '/r/b.md': fragment({ date: '2026-10-05T00:00:00.000Z' }),
      '/r/a.md': fragment({ date: '2026-10-05T00:00:00.000Z' }),
    })
    expect(notes.map((n) => n.id)).toEqual(['a', 'b', 'old'])
  })

  it('keeps only the newest 20', () => {
    const files = Object.fromEntries(
      Array.from({ length: 25 }, (_, i) => [
        `/r/n${i}.md`,
        fragment({ date: new Date(Date.UTC(2026, 9, 1 + i)).toISOString() }),
      ]),
    )
    const notes = loadReleaseNotes(files)
    expect(notes).toHaveLength(RELEASE_NOTES_LIMIT)
    expect(notes[0]!.id).toBe('n24')
    expect(notes.at(-1)!.id).toBe('n5')
  })
})

// Read from disk when the test runs, not through `import.meta.glob`: Vitest caches a test
// module's glob, so an unchanged test file would keep passing after a bad fragment is added.
const RELEASE_NOTES_DIR = fileURLToPath(new URL('../../../release-notes/', import.meta.url))

function readReleaseNotesDir(keep: (file: string) => boolean): Record<string, string> {
  return Object.fromEntries(
    readdirSync(RELEASE_NOTES_DIR)
      .filter(keep)
      .map((file) => [file, readFileSync(join(RELEASE_NOTES_DIR, file), 'utf8')]),
  )
}

describe('the bundled release notes', () => {
  it('parses every fragment in release-notes/ without leaving one out', () => {
    const files = readReleaseNotesDir((file) => file.endsWith('.md'))
    const total = Object.keys(files).length
    expect(loadReleaseNotes(files, total)).toHaveLength(total)
  })

  it('keeps the template valid, with a one-sentence body free of authoring notes', () => {
    const raw = Object.values(readReleaseNotesDir((file) => file === '_template.md.example'))[0]!
    const note = parseFragment('template', raw)
    expect(note.body).not.toMatch(/newest 20|never rename/)
  })

  it('exports them newest first', () => {
    expect(RELEASE_NOTES.length).toBeLessThanOrEqual(RELEASE_NOTES_LIMIT)
    const dates = RELEASE_NOTES.map((n) => Date.parse(n.date))
    expect(dates).toEqual([...dates].sort((a, b) => b - a))
  })
})
