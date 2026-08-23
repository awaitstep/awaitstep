/**
 * Expression parser for `{{ ... }}` template expressions.
 *
 * Grammar (strict superset of v1's identifier paths):
 *
 *   expr    := ref segment* fallback?
 *   ref     := word                        // [A-Za-z0-9_]+ — node id or reserved ref
 *   segment := '.' word                    // property (all-digit words are array indexes)
 *            | '[' ws int ws ']'           // array index
 *            | '[' ws string ws ']'        // quoted property key
 *   fallback:= ws '??' ws literal          // string | number | boolean | null
 *
 * No whitespace is allowed before the ref or between path segments — exactly
 * as in v1 — so strings like `{{ not an expression }}` remain literal text.
 * Content that fails to parse degrades to v1 behavior: it is left untouched
 * and surfaces as a warning via findMalformedExpressions, never a hard error.
 */

export type ExpressionSegment =
  { kind: 'prop'; name: string } | { kind: 'index'; value: number } | { kind: 'key'; value: string }

export type ExpressionLiteral =
  | { kind: 'string'; value: string }
  | { kind: 'number'; value: number }
  | { kind: 'boolean'; value: boolean }
  | { kind: 'null' }

export interface ExpressionAST {
  ref: string
  segments: ExpressionSegment[]
  fallback?: ExpressionLiteral
}

export interface ExpressionSpan {
  /** Full matched text including the braces. */
  raw: string
  start: number
  end: number
  ast: ExpressionAST
}

const WORD = /^[A-Za-z0-9_]+/
const DIGITS = /^[0-9]+$/
const NUMBER = /^-?[0-9]+(?:\.[0-9]+)?/

class Reader {
  pos = 0
  constructor(private readonly src: string) {}

  peek(): string {
    return this.src[this.pos] ?? ''
  }

  take(text: string): boolean {
    if (this.src.startsWith(text, this.pos)) {
      this.pos += text.length
      return true
    }
    return false
  }

  takeMatch(re: RegExp): string | null {
    const m = re.exec(this.src.slice(this.pos))
    if (!m || m.index !== 0) return null
    this.pos += m[0].length
    return m[0]
  }

  skipWs(): void {
    while (this.pos < this.src.length && /\s/.test(this.src[this.pos]!)) this.pos++
  }

  atEnd(): boolean {
    return this.pos >= this.src.length
  }
}

function parseQuotedString(r: Reader): string | null {
  const quote = r.peek()
  if (quote !== '"' && quote !== "'") return null
  r.take(quote)
  let out = ''
  for (;;) {
    if (r.atEnd()) return null
    const ch = r.peek()
    if (ch === '\\') {
      r.take('\\')
      const next = r.peek()
      if (r.atEnd()) return null
      out += next === 'n' ? '\n' : next === 't' ? '\t' : next
      r.take(next)
      continue
    }
    if (ch === quote) {
      r.take(quote)
      return out
    }
    out += ch
    r.take(ch)
  }
}

function parseLiteral(r: Reader): ExpressionLiteral | null {
  const str = parseQuotedString(r)
  if (str !== null) return { kind: 'string', value: str }
  if (r.take('true')) return { kind: 'boolean', value: true }
  if (r.take('false')) return { kind: 'boolean', value: false }
  if (r.take('null')) return { kind: 'null' }
  const num = r.takeMatch(NUMBER)
  if (num !== null) return { kind: 'number', value: Number(num) }
  return null
}

/**
 * Parses the content between `{{` and `}}`. Returns null when the content is
 * not a valid expression — callers leave the original text untouched.
 */
export function parseExpressionContent(content: string): ExpressionAST | null {
  const r = new Reader(content)

  const ref = r.takeMatch(WORD)
  if (ref === null) return null

  const segments: ExpressionSegment[] = []
  for (;;) {
    if (r.take('.')) {
      const word = r.takeMatch(WORD)
      if (word === null) return null
      segments.push(
        DIGITS.test(word) ? { kind: 'index', value: Number(word) } : { kind: 'prop', name: word },
      )
      continue
    }
    if (r.take('[')) {
      r.skipWs()
      const key = parseQuotedString(r)
      if (key !== null) {
        r.skipWs()
        if (!r.take(']')) return null
        segments.push({ kind: 'key', value: key })
        continue
      }
      const digits = r.takeMatch(/^[0-9]+/)
      if (digits === null) return null
      r.skipWs()
      if (!r.take(']')) return null
      segments.push({ kind: 'index', value: Number(digits) })
      continue
    }
    break
  }

  let fallback: ExpressionLiteral | undefined
  const beforeWs = r.pos
  r.skipWs()
  if (r.take('??')) {
    r.skipWs()
    const literal = parseLiteral(r)
    if (literal === null) return null
    fallback = literal
    // The fallback form is v2-only, so trailing padding like
    // `{{name ?? "anon" }}` can be tolerated without any v1 conflict.
    r.skipWs()
  } else if (r.pos !== beforeWs) {
    // Whitespace is only allowed around a fallback operator — `{{ a.b }}`
    // stayed literal in v1 and must keep doing so.
    return null
  }

  if (!r.atEnd()) return null

  const ast: ExpressionAST = { ref, segments }
  if (fallback) ast.fallback = fallback
  return ast
}

/**
 * Scans a string for `{{ ... }}` expression spans. Invalid candidates are
 * skipped (left as literal text); scanning resumes one character later so an
 * expression nested after a stray `{{` is still found, matching how v1's
 * regex backtracked.
 */
/**
 * Longest candidate content worth parsing. Real expressions are short; a
 * `{{` that is thousands of characters from the next `}}` is code or prose,
 * and skipping the parse keeps brace-heavy inputs (code fields) linear.
 */
const MAX_CANDIDATE_LENGTH = 256

export function scanExpressions(input: string): ExpressionSpan[] {
  const spans: ExpressionSpan[] = []
  let i = 0
  let close = -1
  while (i < input.length) {
    const start = input.indexOf('{{', i)
    if (start === -1) break
    // `close` only ever moves forward, so failed candidates that share the
    // same closing braces reuse it instead of rescanning the tail.
    if (close < start + 2) close = input.indexOf('}}', start + 2)
    if (close === -1) break
    const length = close - (start + 2)
    const ast =
      length <= MAX_CANDIDATE_LENGTH ? parseExpressionContent(input.slice(start + 2, close)) : null
    if (ast) {
      spans.push({ raw: input.slice(start, close + 2), start, end: close + 2, ast })
      i = close + 2
    } else {
      i = start + 1
    }
  }
  return spans
}

export interface ParsedExpression {
  raw: string
  nodeId: string
  path: string[]
}

/**
 * Parse all template expressions from a string.
 * Returns an array of parsed expressions with nodeId and property path.
 */
export function parseExpressions(input: string): ParsedExpression[] {
  return scanExpressions(input).map(({ raw, ast }) => ({
    raw,
    nodeId: ast.ref,
    path: ast.segments.map((s) =>
      s.kind === 'prop' ? s.name : s.kind === 'key' ? s.value : String(s.value),
    ),
  }))
}

export interface MalformedExpression {
  /** The `{{ ... }}` candidate that failed to parse. */
  raw: string
  start: number
}

/**
 * Returns `{{ ... }}` candidates that are NOT valid expressions. They are left
 * untouched at codegen time (v1 behavior); surface these as editor warnings.
 */
export function findMalformedExpressions(input: string): MalformedExpression[] {
  const valid = new Set(scanExpressions(input).map((s) => s.start))
  const out: MalformedExpression[] = []
  let i = 0
  while (i < input.length) {
    const start = input.indexOf('{{', i)
    if (start === -1) break
    const close = input.indexOf('}}', start + 2)
    if (close === -1) break
    if (!valid.has(start)) {
      // Only report the outermost candidate at this position when it does not
      // overlap a valid span that begins inside it.
      const overlapsValid = [...valid].some((v) => v > start && v < close + 2)
      if (!overlapsValid) out.push({ raw: input.slice(start, close + 2), start })
    }
    i = close + 2
  }
  return out
}
