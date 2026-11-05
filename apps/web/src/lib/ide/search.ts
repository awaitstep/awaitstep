export interface SearchOptions {
  query: string
  caseSensitive: boolean
  wholeWord: boolean
  regex: boolean
}

/** A file to search: its text as the editor has it, drafts included. */
export interface SearchFile {
  path: string
  source: string
  /** Canvas output rather than project code; listed in its own group. */
  generated: boolean
}

export interface SearchHit {
  /** 1-based, in the file as the editor shows it. */
  line: number
  column: number
  endColumn: number
  /** The line, trimmed and shortened around the match, for the result row. */
  text: string
  /** Where the match sits inside `text`. */
  matchStart: number
  matchEnd: number
}

export interface FileHits {
  path: string
  generated: boolean
  hits: SearchHit[]
}

export interface SearchResults {
  files: FileHits[]
  /** Hits listed. Equals the cap when `capped`; the real total is then unknown. */
  total: number
  capped: boolean
}

export type SearchOutcome =
  | { kind: 'results'; results: SearchResults }
  | { kind: 'invalid'; message: string }
  | { kind: 'timeout' }
  /** The search could not run at all: the worker failed to load or crashed. */
  | { kind: 'failed' }

/** Hits kept before the search stops: keeps the list and the worker's reply small. */
export const MAX_SEARCH_HITS = 1000

/** Characters of context kept on either side of a match in a result row. */
const CONTEXT_BEFORE = 30
const CONTEXT_AFTER = 120
const MAX_PREVIEW = 300

const REGEX_SPECIALS = /[.*+?^${}()|[\]\\]/g

export function escapeRegex(text: string): string {
  return text.replace(REGEX_SPECIALS, '\\$&')
}

export type PatternResult = { pattern: RegExp } | { error: string }

/**
 * The query as a global regex, or the parser's own message. Cheap and safe
 * to run on the main thread: only *matching* a pattern can run away, and
 * that happens in the worker. An empty query has no pattern.
 */
export function buildSearchPattern(options: SearchOptions): PatternResult | null {
  if (options.query === '') return null
  const body = options.regex ? options.query : escapeRegex(options.query)
  // `\b` fails next to a non-word edge such as the `#` of `#app/…`, so the
  // word check is "no word character touches the match" on either side.
  const source = options.wholeWord ? `(?<!\\w)(?:${body})(?!\\w)` : body
  try {
    return { pattern: new RegExp(source, options.caseSensitive ? 'g' : 'gi') }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Invalid regular expression' }
  }
}

function preview(line: string, start: number, end: number): Preview {
  const lead = line.length - line.trimStart().length
  // A match that begins in the indentation starts the row itself.
  const from = Math.min(start, Math.max(lead, start - CONTEXT_BEFORE))
  const to = Math.min(line.length, end + CONTEXT_AFTER, from + MAX_PREVIEW)
  const prefix = from > lead ? '…' : ''
  const suffix = to < line.length ? '…' : ''
  const text = `${prefix}${line.slice(from, to)}${suffix}`
  const matchStart = prefix.length + (start - from)
  const matchEnd = prefix.length + (Math.min(end, to) - from)
  return { text, matchStart, matchEnd }
}

interface Preview {
  text: string
  matchStart: number
  matchEnd: number
}

const LINE_BREAK = /\r\n|\r|\n/

function searchFile(
  file: SearchFile,
  pattern: RegExp,
  room: number,
): { hits: SearchHit[]; full: boolean } {
  const hits: SearchHit[] = []
  const lines = file.source.split(LINE_BREAK)
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!
    pattern.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = pattern.exec(line)) !== null) {
      // An empty match (`a*` on "b") lands everywhere and says nothing.
      if (match[0] === '') {
        pattern.lastIndex++
        continue
      }
      // Stop only when there is one more hit than fits, so exactly `room`
      // hits is a complete answer rather than a capped one.
      if (hits.length >= room) return { hits, full: true }
      const start = match.index
      const end = start + match[0].length
      hits.push({
        line: index + 1,
        column: start + 1,
        endColumn: end + 1,
        ...preview(line, start, end),
      })
    }
  }
  return { hits, full: false }
}

/**
 * Searches the files line by line (a match never spans lines, as in VS
 * Code's default). Your files come first, then generated ones, each in path
 * order. Stops at `limit` hits.
 */
export function searchFiles(
  files: readonly SearchFile[],
  pattern: RegExp,
  limit = MAX_SEARCH_HITS,
): SearchResults {
  const ordered = [...files].sort(
    (a, b) => Number(a.generated) - Number(b.generated) || a.path.localeCompare(b.path, 'en'),
  )
  const found: FileHits[] = []
  let total = 0
  let capped = false
  for (const file of ordered) {
    const { hits, full } = searchFile(file, pattern, limit - total)
    if (hits.length > 0) found.push({ path: file.path, generated: file.generated, hits })
    total += hits.length
    if (full) {
      capped = true
      break
    }
  }
  return { files: found, total, capped }
}

/** The whole search: validates the query, then matches. Runs inside the worker. */
export function runSearch(files: readonly SearchFile[], options: SearchOptions): SearchOutcome {
  const built = buildSearchPattern(options)
  if (built === null) return { kind: 'results', results: { files: [], total: 0, capped: false } }
  if ('error' in built) return { kind: 'invalid', message: built.error }
  return { kind: 'results', results: searchFiles(files, built.pattern) }
}

/** Where the project's own files end and generated ones begin: one rule for the panel and the rename count. */
export function toSearchFiles(
  files: Iterable<{ path: string; source: string }>,
  projectPaths: ReadonlySet<string>,
): SearchFile[] {
  return [...files].map((f) => ({
    path: f.path,
    source: f.source,
    generated: !projectPaths.has(f.path),
  }))
}

/**
 * The options a rename follow-up searches with: a regex that finds the old
 * import path as a whole quoted string, with or without its extension. A
 * plain whole-word match would also hit `…/refund-policy` and `…/refund/types`.
 */
export function importerSearch(specifier: string): SearchOptions {
  const quote = '[\'"`]'
  return {
    query: `${quote}${escapeRegex(specifier)}(?:\\.(?:ts|js))?${quote}`,
    caseSensitive: true,
    wholeWord: false,
    regex: true,
  }
}

/**
 * How many project files mention `specifier` as an import path. Only
 * `#app/…` specifiers are counted: relative imports would need path
 * resolution per importing file. The Search view lists exactly these files
 * (`importerSearch` over the project's own files), so the toast and the list agree.
 */
export function countImporters(files: readonly SearchFile[], specifier: string): number {
  const built = buildSearchPattern(importerSearch(specifier))
  if (built === null || 'error' in built) return 0
  const { pattern } = built
  // Same line-by-line rule as `searchFile`, but a file counts at its first
  // hit: no hit list, no previews, no reading on once it is known to match.
  let count = 0
  for (const file of files) {
    if (file.generated) continue
    for (const line of file.source.split(LINE_BREAK)) {
      pattern.lastIndex = 0
      if (pattern.test(line)) {
        count++
        break
      }
    }
  }
  return count
}

/** "1,000+" when capped: the true total is not known. */
export function formatHitCount(total: number, capped: boolean): string {
  return `${total.toLocaleString('en-US')}${capped ? '+' : ''}`
}
