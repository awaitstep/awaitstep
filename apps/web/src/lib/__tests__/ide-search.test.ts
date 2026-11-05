import { describe, expect, it, vi } from 'vitest'
import {
  MAX_SEARCH_HITS,
  buildSearchPattern,
  countImporters,
  formatHitCount,
  importerSearch,
  runSearch,
  toSearchFiles,
  type SearchOptions,
  type SearchResults,
} from '../ide/search'
import { CHARGE_FILES, IMPORT_FILES } from './fixtures/search/files'

function opts(query: string, extra: Partial<SearchOptions> = {}): SearchOptions {
  return { query, caseSensitive: false, wholeWord: false, regex: false, ...extra }
}

function results(outcome: ReturnType<typeof runSearch>): SearchResults {
  if (outcome.kind !== 'results') throw new Error(`expected results, got ${outcome.kind}`)
  return outcome.results
}

function hitsByPath(r: SearchResults): Record<string, number> {
  return Object.fromEntries(r.files.map((f) => [f.path, f.hits.length]))
}

describe('runSearch', () => {
  it('finds literal text case-insensitively and counts hits per file', () => {
    const r = results(runSearch(CHARGE_FILES, opts('chargeorder')))
    expect(hitsByPath(r)).toEqual({
      'lib/errors.ts': 1,
      'lib/payments/charge.ts': 2,
      'worker.ts': 2,
    })
    expect(r.total).toBe(5)
    expect(r.capped).toBe(false)
  })

  it('match case separates Charge from charge', () => {
    const on = results(runSearch(CHARGE_FILES, opts('Charge', { caseSensitive: true })))
    // Only the capital "Charge" lines: the variable and its return.
    expect(on.files.map((f) => f.hits.map((h) => h.line))).toEqual([[2, 3]])
    const off = results(runSearch(CHARGE_FILES, opts('Charge')))
    expect(off.total).toBeGreaterThan(on.total)
  })

  it('whole word skips chargeOrder when looking for charge', () => {
    const loose = results(runSearch(CHARGE_FILES, opts('charge', { caseSensitive: true })))
    const whole = results(
      runSearch(CHARGE_FILES, opts('charge', { caseSensitive: true, wholeWord: true })),
    )
    expect(loose.total).toBeGreaterThan(whole.total)
    // Standalone `charge`: env.charge( and the import path segment; never chargeOrder.
    const texts = whole.files.flatMap((f) => f.hits.map((h) => h.text))
    expect(texts).toHaveLength(2)
    expect(texts.some((t) => t.includes('env.charge('))).toBe(true)
    expect(texts.every((t) => !/chargeOrder\b.*chargeOrder/.test(t))).toBe(true)
  })

  it('regex mode matches patterns; literal mode escapes them', () => {
    const regex = results(runSearch(CHARGE_FILES, opts('charge\\w+', { regex: true })))
    expect(regex.total).toBeGreaterThan(0)
    const literal = results(runSearch(CHARGE_FILES, opts('charge\\w+')))
    expect(literal.total).toBe(0)
    const dot = results(runSearch(CHARGE_FILES, opts('env.charge(')))
    expect(dot.total).toBe(1)
  })

  it('reports the parser message for a regex that does not parse, and no results', () => {
    const out = runSearch(CHARGE_FILES, opts('(', { regex: true }))
    expect(out.kind).toBe('invalid')
    expect(out.kind === 'invalid' && out.message).toMatch(/Invalid regular expression/)
  })

  it('returns nothing for an empty query', () => {
    expect(results(runSearch(CHARGE_FILES, opts(''))).total).toBe(0)
  })

  it('gives 1-based line and column positions with the end column for selection', () => {
    const r = results(runSearch(CHARGE_FILES, opts('chargeOrder', { caseSensitive: true })))
    const first = r.files.find((f) => f.path === 'lib/payments/charge.ts')!.hits[0]!
    expect(first).toMatchObject({ line: 1, column: 23, endColumn: 34 })
  })

  it('splits lines on CRLF, LF and CR and handles empty files', () => {
    const r = results(
      runSearch(
        [
          { path: 'a.ts', generated: false, source: 'x\r\nneedle\rneedle\nneedle' },
          { path: 'empty.ts', generated: false, source: '' },
        ],
        opts('needle'),
      ),
    )
    expect(r.files).toHaveLength(1)
    expect(r.files[0]!.hits.map((h) => h.line)).toEqual([2, 3, 4])
  })

  it('lists every match on a line and ignores empty matches', () => {
    const files = [{ path: 'a.ts', generated: false, source: 'aXbXc' }]
    expect(results(runSearch(files, opts('x'))).total).toBe(2)
    expect(results(runSearch(files, opts('x*', { regex: true }))).total).toBe(2)
  })

  it('puts your files before generated ones, each in path order', () => {
    const r = results(runSearch(CHARGE_FILES, opts('chargeOrder')))
    expect(r.files.map((f) => f.generated)).toEqual([false, false, true])
    expect(r.files.map((f) => f.path)).toEqual([
      'lib/errors.ts',
      'lib/payments/charge.ts',
      'worker.ts',
    ])
  })

  it('searches the text it is given, which is how unsaved edits are found', () => {
    const saved = results(runSearch(CHARGE_FILES, opts('zzz')))
    expect(saved.total).toBe(0)
    const edited = CHARGE_FILES.map((f) =>
      f.path === 'lib/errors.ts' ? { ...f, source: `${f.source}// zzz\n` } : f,
    )
    expect(hitsByPath(results(runSearch(edited, opts('zzz'))))).toEqual({ 'lib/errors.ts': 1 })
  })

  it('shortens long lines around the match and keeps the match inside the preview', () => {
    const line = `${'a'.repeat(500)}NEEDLE${'b'.repeat(500)}`
    const hit = results(
      runSearch([{ path: 'a.ts', generated: false, source: line }], opts('needle')),
    ).files[0]!.hits[0]!
    expect(hit.text.length).toBeLessThan(250)
    expect(hit.text.slice(hit.matchStart, hit.matchEnd)).toBe('NEEDLE')
    expect(hit.text.startsWith('…')).toBe(true)
    expect(hit.text.endsWith('…')).toBe(true)
    expect(hit.column).toBe(501)
  })

  it('trims indentation from the preview but keeps the real column', () => {
    const r = results(
      runSearch(
        [{ path: 'a.ts', generated: false, source: '      return needle' }],
        opts('needle'),
      ),
    )
    const hit = r.files[0]!.hits[0]!
    expect(hit.text).toBe('return needle')
    expect(hit.column).toBe(14)
  })

  it('stops at the cap, reports it, and does not scan further files', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      path: `f${String(i).padStart(2, '0')}.ts`,
      generated: false,
      source: 'e '.repeat(100),
    }))
    const r = results(runSearch(many, opts('e')))
    expect(r.total).toBe(MAX_SEARCH_HITS)
    expect(r.capped).toBe(true)
    expect(r.files.reduce((sum, f) => sum + f.hits.length, 0)).toBe(MAX_SEARCH_HITS)
    expect(r.files.length).toBe(10)
  })

  it('is not capped with exactly the limit of hits, and is with one more', () => {
    const exact = [{ path: 'a.ts', generated: false, source: 'e\n'.repeat(MAX_SEARCH_HITS) }]
    const exactResult = results(runSearch(exact, opts('e')))
    expect(exactResult.total).toBe(MAX_SEARCH_HITS)
    expect(exactResult.capped).toBe(false)
    const more = [{ path: 'a.ts', generated: false, source: 'e\n'.repeat(MAX_SEARCH_HITS + 1) }]
    const moreResult = results(runSearch(more, opts('e')))
    expect(moreResult.total).toBe(MAX_SEARCH_HITS)
    expect(moreResult.capped).toBe(true)
  })

  it('is not capped when the limit is hit in one file and the next has no match', () => {
    const files = [
      { path: 'a.ts', generated: false, source: 'e\n'.repeat(MAX_SEARCH_HITS) },
      { path: 'b.ts', generated: false, source: 'nothing' },
    ]
    expect(results(runSearch(files, opts('e'))).capped).toBe(false)
  })

  it('keeps the highlight on the match when it starts in the indentation', () => {
    const source = '    import x\n\t\tfoo\n   '
    const cases: [string, Partial<SearchOptions>, string][] = [
      ['^\\s*import', { regex: true }, '    import'],
      ['  ', {}, '  '],
      [' import', {}, ' import'],
      ['\\s+', { regex: true }, '    '],
    ]
    for (const [query, extra, matched] of cases) {
      const r = results(runSearch([{ path: 'a.ts', generated: false, source }], opts(query, extra)))
      const hit = r.files[0]!.hits[0]!
      expect(hit.matchStart, query).toBeGreaterThanOrEqual(0)
      expect(hit.text.slice(hit.matchStart, hit.matchEnd), query).toBe(matched)
    }
  })
})

describe('buildSearchPattern', () => {
  it('is null for an empty query and an error for a bad regex', () => {
    expect(buildSearchPattern(opts(''))).toBeNull()
    expect(buildSearchPattern(opts('(', { regex: true }))).toEqual({
      error: expect.stringContaining('Unterminated group'),
    })
  })

  it('whole word works next to a non-word edge such as #', () => {
    const built = buildSearchPattern(opts('#app/lib/x', { wholeWord: true }))
    const pattern = (built as { pattern: RegExp }).pattern
    expect(pattern.test(" from '#app/lib/x'")).toBe(true)
    pattern.lastIndex = 0
    expect(pattern.test("from '#app/lib/xy'")).toBe(false)
  })
})

describe('countImporters', () => {
  it('stops reading a file at its first importing line instead of listing every hit', () => {
    const many = Array.from({ length: 5000 }, () => "import { x } from '#app/lib/x'").join('\n')
    const files = [{ path: 'many.ts', source: many, generated: false }]
    const test = vi.spyOn(RegExp.prototype, 'test')
    try {
      expect(countImporters(files, '#app/lib/x')).toBe(1)
      expect(test).toHaveBeenCalledTimes(1)
    } finally {
      test.mockRestore()
    }
  })

  it('counts the project files that import the old path, once each', () => {
    const count = countImporters(IMPORT_FILES, '#app/lib/payments/refund')
    // refund_order, cancel, retry (via .js) — not the refunds importer, not generated worker.ts.
    expect(count).toBe(3)
  })

  it('is zero when nobody imports the file', () => {
    expect(countImporters(IMPORT_FILES, '#app/lib/nobody')).toBe(0)
  })

  it('does not count generated files', () => {
    const files = [{ path: 'gen.ts', generated: true, source: "'#app/lib/a'" }]
    expect(countImporters(files, '#app/lib/a')).toBe(0)
  })

  it('does not count paths that merely start with the old one', () => {
    const files = [
      { path: 'a.ts', generated: false, source: "import x from '#app/lib/payments/refund-policy'" },
      { path: 'b.ts', generated: false, source: "import x from '#app/lib/payments/refund/types'" },
      { path: 'c.ts', generated: false, source: "import x from '#app/lib/payments/refund.test'" },
      { path: 'd.ts', generated: false, source: '// see #app/lib/payments/refund for details' },
      { path: 'e.ts', generated: false, source: 'import x from `#app/lib/payments/refund`' },
      { path: 'f.ts', generated: false, source: "import x from '#app/lib/payments/refund.ts'" },
    ]
    expect(countImporters(files, '#app/lib/payments/refund')).toBe(2)
  })

  it('counts the same files the panel lists, virtual seeds included', () => {
    const everything = [
      { path: 'lib/seed.ts', source: "import '#app/lib/x'" },
      { path: 'lib/stored.ts', source: "import '#app/lib/x'" },
      { path: 'gen.ts', source: "import '#app/lib/x'" },
    ]
    const owned = new Set(['lib/seed.ts', 'lib/stored.ts'])
    const files = toSearchFiles(everything, owned)
    const listed = results(
      runSearch(
        files.filter((f) => !f.generated),
        importerSearch('#app/lib/x'),
      ),
    )
    expect(countImporters(files, '#app/lib/x')).toBe(listed.files.length)
    expect(listed.files.map((f) => f.path)).toEqual(['lib/seed.ts', 'lib/stored.ts'])
  })

  it('lists exactly the files the count reports when searched with importerSearch', () => {
    const r = results(
      runSearch(
        IMPORT_FILES.filter((f) => !f.generated),
        importerSearch('#app/lib/payments/refund'),
      ),
    )
    expect(r.files.map((f) => f.path).sort()).toEqual([
      'handlers/cancel.ts',
      'handlers/refund_order.ts',
      'lib/retry.ts',
    ])
  })
})

describe('formatHitCount', () => {
  it('adds a plus when the total is a floor, and separators otherwise', () => {
    expect(formatHitCount(1000, true)).toBe('1,000+')
    expect(formatHitCount(1234, false)).toBe('1,234')
    expect(formatHitCount(4, false)).toBe('4')
  })
})
