const CLOSERS: Record<string, string> = { '{': '}', '[': ']', '(': ')' }

// A `/` after one of these (or at the start) may open a regex literal. `)` is
// included because `if (x) /re/` is a regex while `f(x) / 2` is a division, and
// telling them apart needs a parser.
const REGEX_PREFIX_CHARS = new Set('()[{},;:=!&|?+-*%<>~^'.split(''))
const REGEX_PREFIX_WORDS = new Set([
  'typeof',
  'void',
  'delete',
  'new',
  'in',
  'instanceof',
  'return',
  'yield',
  'await',
  'case',
  'of',
])

/**
 * True when an HTTP Request Body expression is exactly one object or array
 * literal, such as `{ id: state.id }` or `[1, 2]`. `fetch` would send such a
 * value as `[object Object]`, so the generator stringifies it. Any other
 * expression (`JSON.stringify(...)`, a string, `state.payload`,
 * `new URLSearchParams(...)`, `[a, b].join(",")`) is left as the user wrote it.
 *
 * Strings, template literals and comments are skipped. A Body with a `/` that
 * could open a regex literal (including any `/` right after `)`) is never
 * treated as a literal: its brackets cannot be counted without a parser, and
 * false keeps the Body as written.
 *
 * This is a heuristic for choosing the output, not a sanitiser: the Body is the
 * user's own code either way, and nothing may rely on it to bound that code.
 */
export function isJsonLiteralBody(expression: string): boolean {
  const source = expression.trim()
  if (source[0] !== '{' && source[0] !== '[') return false
  try {
    return closingIndex(source, 0) === source.length - 1
  } catch {
    // Templates nested deeply enough to exhaust the stack.
    return false
  }
}

// Index of the bracket that closes the one at `start`, or -1 if it never
// closes or a regex literal appears before it does.
function closingIndex(source: string, start: number): number {
  const expected: string[] = []
  let lastSignificant = start - 1
  let i = start
  while (i < source.length) {
    const ch = source[i]!
    const next = source[i + 1]
    if (ch === '"' || ch === "'") {
      i = afterQuoted(source, i)
      lastSignificant = i - 1
      continue
    }
    if (ch === '`') {
      const end = afterTemplate(source, i)
      if (end < 0) return -1
      i = end
      lastSignificant = i - 1
      continue
    }
    if (ch === '/' && next === '/') {
      const newline = source.indexOf('\n', i)
      i = newline < 0 ? source.length : newline + 1
      continue
    }
    if (ch === '/' && next === '*') {
      const close = source.indexOf('*/', i + 2)
      i = close < 0 ? source.length : close + 2
      continue
    }
    if (ch === '/' && opensRegex(source, lastSignificant)) return -1
    if (CLOSERS[ch]) {
      expected.push(CLOSERS[ch])
    } else if (ch === '}' || ch === ']' || ch === ')') {
      if (expected.pop() !== ch) return -1
      if (expected.length === 0) return i
    }
    if (!/\s/.test(ch)) lastSignificant = i
    i++
  }
  return -1
}

function opensRegex(source: string, lastSignificant: number): boolean {
  if (lastSignificant < 0) return true
  const before = source[lastSignificant]!
  if (REGEX_PREFIX_CHARS.has(before)) return true
  // The longest prefix word is 10 characters; looking further back adds nothing.
  const tail = source.slice(Math.max(0, lastSignificant - 11), lastSignificant + 1)
  const word = /[A-Za-z_$][\w$]*$/.exec(tail)
  return word !== null && REGEX_PREFIX_WORDS.has(word[0])
}

function afterQuoted(source: string, start: number): number {
  const quote = source[start]
  let i = start + 1
  while (i < source.length) {
    if (source[i] === '\\') i += 2
    else if (source[i] === quote) return i + 1
    else i++
  }
  return source.length
}

// Index just past the template literal at `start`, or -1 if a `${` never closes.
function afterTemplate(source: string, start: number): number {
  let i = start + 1
  while (i < source.length) {
    if (source[i] === '\\') {
      i += 2
    } else if (source[i] === '`') {
      return i + 1
    } else if (source[i] === '$' && source[i + 1] === '{') {
      const close = closingIndex(source, i + 1)
      if (close < 0) return -1
      i = close + 1
    } else {
      i++
    }
  }
  return source.length
}
