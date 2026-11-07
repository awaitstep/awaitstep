import {
  defaultFunctionHeader,
  identifierAt,
  isWordChar,
  maskNonCode,
  matchingBracket,
  skipWhitespace,
  wordAt,
} from './code-text.js'

/** What a step module reads from `inputs`. */
export interface ModuleInputReads {
  /**
   * The keys read by name: `inputs.x`, `inputs?.x`, `inputs["x"]`, the keys
   * of `const { x, y: alias } = inputs`, and of a parameter `{ inputs: { x } }`.
   */
  names: Set<string>
  /**
   * `inputs` is used some other way — spread, passed whole, a rest element,
   * a renamed parameter, a computed index — so every name the call site can
   * bind may be read.
   */
  all: boolean
}

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/
const INPUTS_WORD_RE = /\binputs\b/g

/**
 * The names a module reads from `inputs`, and whether it reads `inputs` in a
 * way that may reach any key. One pass over the code with comments and
 * strings blanked (no parser, no backtracking): the shapes a step is written
 * in are few, and the cost of a miss here is a name passed that is not read,
 * never one withheld that is.
 */
export function moduleInputReads(code: string): ModuleInputReads {
  const masked = maskNonCode(code)
  const names = new Set<string>()
  let all = false

  // The default export's parameter list binds `inputs` — whole, destructured
  // (`{ inputs: { a } }`) or renamed, which reads everything.
  let params: { open: number; close: number } | null = null
  const header = defaultFunctionHeader(masked)
  if (header) {
    const close = matchingBracket(masked, header.paramsOpen, '(', ')')
    if (close !== -1) {
      params = { open: header.paramsOpen, close }
      const text = masked.slice(header.paramsOpen, close + 1)
      for (const match of text.matchAll(INPUTS_WORD_RE)) {
        const after = skipWhitespace(text, match.index! + 6)
        if (text[after] !== ':') continue
        const value = skipWhitespace(text, after + 1)
        if (text[value] === '{') {
          const end = matchingBracket(text, value, '{', '}')
          if (end === -1 || addKeys(text.slice(value + 1, end), names)) all = true
        } else {
          all = true
        }
      }
    }
  }

  // `const { a, b: alias } = inputs`: the pattern before the `=`, found from
  // its closing brace with the opening one on a stack, so nothing scans back.
  const opens: number[] = []
  const destructured = new Set<number>()
  for (let i = 0; i < masked.length; i++) {
    const char = masked[i]
    if (char === '{') {
      opens.push(i)
      continue
    }
    if (char !== '}') continue
    const open = opens.pop()
    if (open === undefined) continue
    let j = skipWhitespace(masked, i + 1)
    if (masked[j] !== '=' || masked[j + 1] === '=' || masked[j + 1] === '>') continue
    j = skipWhitespace(masked, j + 1)
    if (!wordAt(masked, j, 'inputs')) continue
    const next = masked[skipWhitespace(masked, j + 6)]
    if (next === '.' || next === '[' || next === '?') continue
    if (addKeys(masked.slice(open + 1, i), names)) all = true
    destructured.add(j)
  }

  // Every other mention: a member, a quoted index, or some use that may
  // reach any key.
  for (const match of masked.matchAll(INPUTS_WORD_RE)) {
    const at = match.index!
    if (destructured.has(at)) continue
    if (params && at > params.open && at < params.close) continue
    let k = skipWhitespace(masked, at + 6)
    let member = false
    if (masked[k] === '?' && masked[k + 1] === '.') {
      k = skipWhitespace(masked, k + 2)
      member = true
    } else if (masked[k] === '.') {
      k = skipWhitespace(masked, k + 1)
      member = true
    }
    if (member && masked[k] !== '[') {
      const name = identifierAt(masked, k)
      if (name) names.add(name)
      continue
    }
    if (masked[k] === '[') {
      // The key is a string, blanked in the masked text: read it from the code.
      const quoteAt = skipWhitespace(code, k + 1)
      const quote = code[quoteAt]
      const end = quote === '"' || quote === "'" ? code.indexOf(quote, quoteAt + 1) : -1
      const key = end === -1 ? '' : code.slice(quoteAt + 1, end)
      if (IDENTIFIER.test(key) && masked[skipWhitespace(masked, end + 1)] === ']') {
        names.add(key)
        continue
      }
    }
    all = true
  }
  return { names, all }
}

/** The names a module reads from `inputs` by key; see {@link moduleInputReads}. */
export function moduleInputNames(code: string): Set<string> {
  return moduleInputReads(code).names
}

/**
 * Adds the keys of one destructuring pattern's top level — `a`, `b = 1`,
 * `c: { d }`, `e: alias` all name the key — and reports whether a rest
 * element (`...rest`) takes everything else.
 */
function addKeys(inner: string, names: Set<string>): boolean {
  let rest = false
  for (const part of splitTopLevel(inner)) {
    const trimmed = part.trim()
    if (trimmed === '') continue
    if (trimmed.startsWith('...')) {
      rest = true
      continue
    }
    let end = 0
    while (end < trimmed.length && isWordChar(trimmed[end])) end += 1
    const key = trimmed.slice(0, end)
    if (IDENTIFIER.test(key)) names.add(key)
  }
  return rest
}

/** Splits on the commas that are not inside a nested bracket. */
function splitTopLevel(text: string): string[] {
  const parts: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (char === '{' || char === '[' || char === '(') depth += 1
    else if (char === '}' || char === ']' || char === ')') depth -= 1
    else if (char === ',' && depth === 0) {
      parts.push(text.slice(start, i))
      start = i + 1
    }
  }
  parts.push(text.slice(start))
  return parts
}
