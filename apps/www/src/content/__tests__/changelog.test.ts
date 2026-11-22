import { describe, expect, it } from 'vitest'
import { groupByMonth, loadChanges, parseChange, type Change } from '../changelog'

const note = (tag: string, date: string, title = 'A title', body = 'What changed.') =>
  `---\ntag: ${tag}\ndate: ${date}\ntitle: ${title}\nlink: projects\n---\n${body}\n`

describe('parseChange', () => {
  it('reads the tag, date, title and body of a release note', () => {
    expect(
      parseChange(
        'agent-skills',
        note('new', '2026-11-20T08:00:00.000Z', 'Build with your AI agent'),
      ),
    ).toEqual({
      id: 'agent-skills',
      tag: 'new',
      date: '2026-11-20T08:00:00.000Z',
      title: 'Build with your AI agent',
      body: 'What changed.',
    })
  })

  it('keeps colons inside a value', () => {
    expect(parseChange('x', note('fixed', '2026-11-01T00:00:00.000Z', 'Runs: faster'))?.title).toBe(
      'Runs: faster',
    )
  })

  it('rejects a fragment with an unknown tag, a bad date, no title or no body', () => {
    expect(parseChange('x', note('shiny', '2026-11-01T00:00:00.000Z'))).toBeNull()
    expect(parseChange('x', note('new', 'soon'))).toBeNull()
    expect(parseChange('x', note('new', '2026-11-01T00:00:00.000Z', ''))).toBeNull()
    expect(parseChange('x', note('new', '2026-11-01T00:00:00.000Z', 'T', ''))).toBeNull()
    expect(parseChange('x', 'no front matter')).toBeNull()
  })
})

describe('parseChange, read as the dashboard reads it', () => {
  it('keeps a note that starts with a byte-order mark or a blank line', () => {
    expect(parseChange('x', `\uFEFF${note('new', '2026-11-01T00:00:00.000Z')}`)).not.toBeNull()
    expect(parseChange('x', `\n\n${note('new', '2026-11-01T00:00:00.000Z')}`)).not.toBeNull()
  })

  it('rejects a date that is not an ISO instant with a zone', () => {
    expect(parseChange('x', note('new', 'Nov 1 2026'))).toBeNull()
    expect(parseChange('x', note('new', '2026-11-01'))).toBeNull()
  })

  it('stores the date in UTC, so a note written in another zone files under its UTC month', () => {
    const c = parseChange('x', note('new', '2026-12-01T00:30:00+01:00'))!
    expect(c.date).toBe('2026-11-30T23:30:00.000Z')
    expect(groupByMonth([c])[0].key).toBe('2026-11')
  })
})

describe('loadChanges', () => {
  it('takes each id from its file name and drops fragments that do not parse', () => {
    const changes = loadChanges({
      '../../../web/release-notes/one.md': note('new', '2026-11-01T00:00:00.000Z'),
      '../../../web/release-notes/broken.md': 'nope',
    })
    expect(changes.map((c) => c.id)).toEqual(['one'])
  })
})

describe('groupByMonth', () => {
  const change = (id: string, date: string): Change => ({
    id,
    tag: 'new',
    date,
    title: id,
    body: id,
  })

  it('groups notes by month, newest month and newest note first', () => {
    const months = groupByMonth([
      change('oct', '2026-10-05T00:00:00.000Z'),
      change('nov-early', '2026-11-02T00:00:00.000Z'),
      change('nov-late', '2026-11-20T00:00:00.000Z'),
    ])
    expect(months.map((m) => [m.key, m.label])).toEqual([
      ['2026-11', 'November 2026'],
      ['2026-10', 'October 2026'],
    ])
    expect(months[0].changes.map((c) => c.id)).toEqual(['nov-late', 'nov-early'])
  })

  it('orders notes with the same date by id', () => {
    const at = '2026-11-01T00:00:00.000Z'
    expect(groupByMonth([change('b', at), change('a', at)])[0].changes.map((c) => c.id)).toEqual([
      'a',
      'b',
    ])
  })
})
