import type { WorkflowNode } from '@awaitstep/ir'
import { JS_RESERVED_WORDS, isIdentifierName } from '@awaitstep/ir'
import {
  identifierAt,
  isWordChar,
  maskNonCode,
  matchingBracket,
  skipWhitespace,
} from './code-text.js'
import { extractImports } from './imports.js'

const DECLARATION_KEYWORDS = ['const', 'let', 'var', 'function', 'class']
const OPEN = new Set(['{', '(', '['])
const CLOSE = new Set(['}', ')', ']'])

/** The characters after which a `/` starts a regular expression, not a division. */
const REGEX_PRECEDERS = new Set('(,=:[!&|?{};+-*%<>~^'.split(''))
const REGEX_KEYWORD_RE = /\b(?:return|typeof|case|in|of|yield|await|void|delete|throw|new|else|do)$/

/**
 * `masked` (strings and comments already blank) with each regular
 * expression literal blanked too, so a bracket inside one (`/}/`, `/[{]/`)
 * does not move the depth a declaration scan keeps. A `/` starts one where
 * a value is expected: at the start, after an operator or opening
 * punctuation, or after a keyword such as `return`. One line at most; a
 * line with an unclosed one is left as it is from there on, so each
 * character is scanned once.
 */
function maskRegexLiterals(masked: string): string {
  if (!masked.includes('/')) return masked
  const out = masked.split('')
  for (let i = 0; i < masked.length; i++) {
    if (masked[i] !== '/') continue
    let before = i - 1
    while (before >= 0 && /\s/.test(masked[before]!)) before -= 1
    const prev = before < 0 ? '' : masked[before]!
    const startsValue =
      before < 0 ||
      REGEX_PRECEDERS.has(prev) ||
      REGEX_KEYWORD_RE.test(masked.slice(Math.max(0, before - 9), before + 1))
    if (!startsValue) continue
    let end = i + 1
    let inClass = false
    for (; end < masked.length && masked[end] !== '\n'; end++) {
      const char = masked[end]
      if (char === '\\') end += 1
      else if (char === '[') inClass = true
      else if (char === ']') inClass = false
      else if (char === '/' && !inClass) break
    }
    // Not closed on its line: a division after all. Every later `/` on the
    // line would scan the same stretch again, so the line is done.
    if (end >= masked.length || masked[end] !== '/') {
      i = end
      continue
    }
    for (let k = i; k <= end; k++) out[k] = ' '
    i = end
  }
  return out.join('')
}

/** `text` split at its top-level commas (none inside brackets). */
function topLevelParts(text: string): string[] {
  const parts: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!
    if (OPEN.has(char)) depth += 1
    else if (CLOSE.has(char)) depth -= 1
    else if (char === ',' && depth === 0) {
      parts.push(text.slice(start, i))
      start = i + 1
    }
  }
  parts.push(text.slice(start))
  return parts
}

/** The index of the first top-level `=` in `text`, or -1 (`==`, `=>` don't count). */
function topLevelAssign(text: string): number {
  let depth = 0
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!
    if (OPEN.has(char)) depth += 1
    else if (CLOSE.has(char)) depth -= 1
    else if (char === '=' && depth === 0 && text[i + 1] !== '=' && text[i + 1] !== '>') {
      if (!'=!<>'.includes(text[i - 1] ?? '')) return i
    }
  }
  return -1
}

/** Deeper destructuring than this is read as binding nothing. */
const MAX_PATTERN_DEPTH = 32

/** The names a destructuring target binds: `{ a, b: c = 1, ...d }`, `[a, [b]]`, or `name`. */
function targetNames(target: string, depth = 0): string[] {
  if (depth > MAX_PATTERN_DEPTH) return []
  const text = target.trim()
  if (text.startsWith('{') || text.startsWith('[')) {
    const close = matchingBracket(text, 0, text[0]!, text[0] === '{' ? '}' : ']')
    if (close < 0) return []
    const isObject = text[0] === '{'
    return topLevelParts(text.slice(1, close)).flatMap((raw) => {
      let element = raw.trim().replace(/^\.\.\./, '')
      const assign = topLevelAssign(element)
      if (assign >= 0) element = element.slice(0, assign)
      if (isObject) {
        const colon = topLevelParts(element)[0]!.indexOf(':')
        if (colon >= 0) return targetNames(element.slice(colon + 1), depth + 1)
      }
      return targetNames(element, depth + 1)
    })
  }
  const name = identifierAt(text, 0)
  return name && name.length === text.length ? [name] : []
}

/**
 * Whether a `function`/`class` keyword at `at` starts a declaration rather
 * than an expression (`= function step() {}`, `return class {}`): it starts
 * the code or a statement, or follows `async`/`export`/`default`.
 */
function startsDeclaration(text: string, at: number): boolean {
  let i = at - 1
  let newline = false
  while (i >= 0 && /\s/.test(text[i]!)) {
    if (text[i] === '\n') newline = true
    i -= 1
  }
  if (i < 0) return true
  const before = text[i]!
  if (';{})'.includes(before)) return true
  if (/\b(?:async|export|default)$/.test(text.slice(0, i + 1))) return true
  // A line break ends a statement unless the line ends in an operator.
  return newline && !'=(,:?!&|+-*/<>.'.includes(before) && !/\breturn$/.test(text.slice(0, i + 1))
}

/**
 * The names code declares at its own top level: `const`/`let`/`var`
 * (destructuring and comma lists too), `function` and `class` declarations.
 * Comments and strings don't count, and neither does anything inside
 * brackets (a block, a nested function, a type argument list) or a named
 * function or class expression (`const f = function step() {}`).
 */
export function topLevelDeclarations(code: string): string[] {
  const masked = maskRegexLiterals(maskNonCode(code))
  const names: string[] = []
  let depth = 0
  for (let i = 0; i < masked.length; i++) {
    const char = masked[i]!
    if (OPEN.has(char)) depth += 1
    else if (CLOSE.has(char)) depth = Math.max(0, depth - 1)
    if (depth !== 0 || isWordChar(masked[i - 1])) continue
    const keyword = DECLARATION_KEYWORDS.find(
      (word) => masked.startsWith(word, i) && !isWordChar(masked[i + word.length]),
    )
    if (!keyword) continue
    // `obj.class`, `x.const`: a property, not a keyword.
    if (masked.slice(0, i).trimEnd().endsWith('.')) continue
    const isDeclarator = keyword === 'const' || keyword === 'let' || keyword === 'var'
    if (!isDeclarator && !startsDeclaration(masked, i)) continue
    let at = skipWhitespace(masked, i + keyword.length)
    if (!isDeclarator) {
      if (masked[at] === '*') at = skipWhitespace(masked, at + 1)
      const name = identifierAt(masked, at)
      if (name) names.push(name)
      continue
    }
    // The declarator list runs to the first top-level `;` or line end that
    // isn't inside brackets.
    let end = at
    let nest = 0
    for (; end < masked.length; end++) {
      const c = masked[end]!
      if (OPEN.has(c)) nest += 1
      else if (CLOSE.has(c)) nest -= 1
      if (nest < 0 || (nest === 0 && (c === ';' || c === '\n'))) break
    }
    for (const declarator of topLevelParts(masked.slice(at, end))) {
      const assign = topLevelAssign(declarator)
      let target = assign >= 0 ? declarator.slice(0, assign) : declarator
      // `name: Type` — the type annotation isn't a binding.
      if (!/^\s*[{[]/.test(target)) target = target.split(':')[0]!
      names.push(...targetNames(target))
    }
    // Resume after the list: rescanning it from each keyword inside would
    // make a long one-line list quadratic.
    i = Math.max(i, end - 1)
  }
  return names
}

/**
 * The names an inline step binds in the body around it: what its code
 * declares at its own top level, after its imports. Imports are left out —
 * they are hoisted to the file's top, and a step imports what it needs
 * itself. Any other node binds nothing here.
 */
export function inlineStepNames(node: WorkflowNode): string[] {
  if (node.type !== 'step' || node.data.inline !== true) return []
  const code = String(node.data.code ?? '')
  const known = NAMES_BY_NODE.get(node)
  if (known?.code === code) return known.names
  const { body } = extractImports(code)
  // `class extends Base {}` reads as a class named `extends`: only a real
  // identifier can be passed on.
  const names = [...new Set(topLevelDeclarations(body))].filter(
    (name) => isIdentifierName(name) && !RESERVED.has(name),
  )
  NAMES_BY_NODE.set(node, { code, names })
  return names
}

const RESERVED: ReadonlySet<string> = new Set(JS_RESERVED_WORDS)

/**
 * The names per node, so the many readers of one graph (each scope variant,
 * the checks, the emitters) parse each step's code once. Held only as long
 * as the node is, and checked against the code in case it was edited.
 */
const NAMES_BY_NODE = new WeakMap<WorkflowNode, { code: string; names: string[] }>()
