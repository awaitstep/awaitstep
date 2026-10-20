import { describe, it, expect } from 'vitest'
import { logPageFromBuffers, logPageFromEntries } from '../../test-sessions/log-page.js'

const NOW = 1_700_000_000_000

describe('logPageFromBuffers', () => {
  it('splits both streams into entries and reports a cursor per stream', () => {
    const page = logPageFromBuffers({ stdout: 'Ready on\nhttp://x\n', stderr: 'warn\n' }, '', NOW)
    expect(page.entries).toEqual([
      { timestamp: NOW, stream: 'stdout', text: 'Ready on' },
      { timestamp: NOW, stream: 'stdout', text: 'http://x' },
      { timestamp: NOW, stream: 'stderr', text: 'warn' },
    ])
    expect(page.cursor).toBe('2:1')
  })

  it('tracks the streams independently as they grow', () => {
    // The case a single counter gets wrong: stdout advances, so a combined
    // count lands mid-list and resends every stderr line while skipping new
    // stdout ones. wrangler writes warnings to stderr in every session.
    const first = logPageFromBuffers({ stdout: 'a\n', stderr: 'warn\n' }, undefined, NOW)
    expect(first.entries.map((e) => e.text)).toEqual(['a', 'warn'])

    const second = logPageFromBuffers({ stdout: 'a\nb\n', stderr: 'warn\n' }, first.cursor, NOW)
    expect(second.entries.map((e) => e.text)).toEqual(['b'])

    const third = logPageFromBuffers(
      { stdout: 'a\nb\n', stderr: 'warn\nboom\n' },
      second.cursor,
      NOW,
    )
    expect(third.entries.map((e) => e.text)).toEqual(['boom'])
  })

  it('reports nothing new when the buffers have not changed', () => {
    const page = logPageFromBuffers({ stdout: 'a\nb\n' }, '2:0', NOW)
    expect(page.entries).toEqual([])
    expect(page.cursor).toBe('2:0')
  })

  it('holds back a line that is still being written', () => {
    // Delivering half a line means the user never sees the whole one: the
    // rest arrives as its own entry, and nothing joins them again.
    const partial = logPageFromBuffers({ stdout: 'complete\nhalf' }, undefined, NOW)
    expect(partial.entries.map((e) => e.text)).toEqual(['complete'])
    expect(partial.cursor).toBe('1:0')

    const finished = logPageFromBuffers({ stdout: 'complete\nhalf done\n' }, partial.cursor, NOW)
    expect(finished.entries.map((e) => e.text)).toEqual(['half done'])
  })

  it('drops blank lines and copes with missing streams', () => {
    expect(logPageFromBuffers({}, undefined, NOW).entries).toEqual([])
    expect(logPageFromBuffers({ stdout: '\n\n' }, undefined, NOW).entries).toEqual([])
  })

  it('treats an unusable cursor as the beginning', () => {
    for (const cursor of ['', 'nonsense', '-1:-1', undefined]) {
      expect(
        logPageFromBuffers({ stdout: 'a\n' }, cursor, NOW).entries,
        String(cursor),
      ).toHaveLength(1)
    }
  })

  it('treats a cursor beyond the buffers as nothing new', () => {
    // A container restart truncates the buffers; asking from further ahead
    // must not throw or replay.
    expect(logPageFromBuffers({ stdout: 'a\n' }, '99:99', NOW).entries).toEqual([])
  })
})

describe('logPageFromEntries', () => {
  const entries = [
    { timestamp: 1, stream: 'stdout' as const, text: 'a' },
    { timestamp: 2, stream: 'stderr' as const, text: 'b' },
  ]

  it('pages entries that already carry their own clock', () => {
    expect(logPageFromEntries(entries, 2)).toEqual({ entries, cursor: '2' })
    expect(logPageFromEntries(entries, 2, '1')).toEqual({ entries: [entries[1]], cursor: '2' })
    expect(logPageFromEntries([], 0)).toEqual({ entries: [], cursor: '0' })
  })

  it('keeps advancing once the oldest entries are gone', () => {
    // The cursor counts everything ever written, so a log that drops its
    // oldest lines does not pin the cursor and stop delivering new ones.
    const page = logPageFromEntries(entries, 2_002, '2000')
    expect(page.cursor).toBe('2002')
    expect(page.entries).toEqual(entries)
  })

  it('treats an unusable cursor as the beginning', () => {
    expect(logPageFromEntries(entries, 2, 'nonsense').entries).toEqual(entries)
  })
})
