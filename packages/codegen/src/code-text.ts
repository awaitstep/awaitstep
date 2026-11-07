/**
 * Reading a step's code without parsing it: one linear pass that blanks what
 * is not code, and small scanners over the result. Nothing here backtracks,
 * so a pathological input costs its length and no more.
 */

const EXPORT_DEFAULT_RE = /\bexport\s+default\b/

/**
 * `code` with every comment and every string or template literal's text
 * replaced by spaces (newlines kept), so a scan for a keyword, a name or a
 * `return` sees only code — and, since the length is kept, every offset into
 * the result still points into `code`. A template literal keeps its `${ … }`
 * expressions, which are code. Regular expression literals are not
 * recognised (they cannot be told from division without a parser), so a
 * quote inside one may blank what follows it, as the comment stripper always
 * did.
 */
export function maskNonCode(code: string): string {
  const length = code.length
  const out: string[] = new Array<string>(length)
  const blank = (index: number): void => {
    out[index] = code[index] === '\n' ? '\n' : ' '
  }
  // Inside a template's `${ … }` the code frame counts braces so the `}`
  // that closes the expression is told from one inside it.
  type Frame = { kind: 'code'; depth: number } | { kind: 'template' }
  const stack: Frame[] = [{ kind: 'code', depth: 0 }]
  let i = 0
  while (i < length) {
    const frame = stack[stack.length - 1]!
    const char = code[i]!
    if (frame.kind === 'template') {
      if (char === '\\') {
        blank(i)
        if (i + 1 < length) blank(i + 1)
        i += 2
        continue
      }
      if (char === '`') {
        blank(i)
        i += 1
        stack.pop()
        continue
      }
      if (char === '$' && code[i + 1] === '{') {
        out[i] = '$'
        out[i + 1] = '{'
        i += 2
        stack.push({ kind: 'code', depth: 0 })
        continue
      }
      blank(i)
      i += 1
      continue
    }
    if (char === '/' && code[i + 1] === '/') {
      while (i < length && code[i] !== '\n') blank(i++)
      continue
    }
    if (char === '/' && code[i + 1] === '*') {
      const end = code.indexOf('*/', i + 2)
      const stop = end === -1 ? length : end + 2
      while (i < stop) blank(i++)
      continue
    }
    if (char === '"' || char === "'") {
      blank(i++)
      while (i < length) {
        const current = code[i]!
        if (current === '\\') {
          blank(i)
          if (i + 1 < length) blank(i + 1)
          i += 2
          continue
        }
        blank(i++)
        if (current === char || current === '\n') break
      }
      continue
    }
    if (char === '`') {
      blank(i++)
      stack.push({ kind: 'template' })
      continue
    }
    if (char === '{') {
      frame.depth += 1
    } else if (char === '}') {
      if (frame.depth === 0 && stack.length > 1) {
        out[i++] = '}'
        stack.pop()
        continue
      }
      frame.depth -= 1
    }
    out[i] = char
    i += 1
  }
  return out.join('')
}

export function isWordChar(char: string | undefined): boolean {
  return char !== undefined && /[\w$]/.test(char)
}

/** The index of the first non-whitespace character at or after `from`. */
export function skipWhitespace(text: string, from: number): number {
  let i = from
  while (i < text.length && /\s/.test(text[i]!)) i += 1
  return i
}

/** Whether `word` sits at `at` as a whole word. */
export function wordAt(text: string, at: number, word: string): boolean {
  return (
    text.startsWith(word, at) && !isWordChar(text[at - 1]) && !isWordChar(text[at + word.length])
  )
}

/** The identifier starting at `from`, or an empty string. */
export function identifierAt(text: string, from: number): string {
  let i = from
  if (!/[A-Za-z_$]/.test(text[i] ?? '')) return ''
  while (isWordChar(text[i])) i += 1
  return text.slice(from, i)
}

/** Every identifier-shaped word in `text`, once. */
export function identifierWords(text: string): Set<string> {
  return new Set(text.match(/[A-Za-z_$][\w$]*/g) ?? [])
}

/** The index of the bracket closing the one at `open`, or -1. */
export function matchingBracket(
  text: string,
  open: number,
  opener: string,
  closer: string,
): number {
  let depth = 0
  for (let i = open; i < text.length; i++) {
    if (text[i] === opener) depth += 1
    else if (text[i] === closer && --depth === 0) return i
  }
  return -1
}

/** The default-exported function declaration's header, as offsets into the (masked) text. */
export interface DefaultFunctionHeader {
  /** Where `export` starts. */
  start: number
  /** The declared name, or null for `export default function (`. */
  name: string | null
  nameStart: number
  nameEnd: number
  /** The `(` opening the parameter list. */
  paramsOpen: number
}

/**
 * `export default [async] function [*] [name] (` read by hand, so a long run
 * of whitespace costs its length: null when the default export is not a
 * function declaration (an arrow, an identifier) or absent.
 */
export function defaultFunctionHeader(masked: string): DefaultFunctionHeader | null {
  const match = EXPORT_DEFAULT_RE.exec(masked)
  if (!match) return null
  let i = skipWhitespace(masked, match.index + match[0].length)
  if (wordAt(masked, i, 'async')) i = skipWhitespace(masked, i + 5)
  if (!wordAt(masked, i, 'function')) return null
  i = skipWhitespace(masked, i + 8)
  if (masked[i] === '*') i = skipWhitespace(masked, i + 1)
  const nameStart = i
  const name = identifierAt(masked, i)
  const nameEnd = nameStart + name.length
  i = skipWhitespace(masked, nameEnd)
  if (masked[i] !== '(') return null
  return { start: match.index, name: name || null, nameStart, nameEnd, paramsOpen: i }
}
