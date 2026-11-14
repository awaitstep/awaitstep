import type { ValidationError, WorkflowIR } from '@awaitstep/ir'
import { INLINE_TAKEN_NAMES } from '@awaitstep/ir'
import {
  identifierAt,
  isWordChar,
  maskNonCode,
  matchingBracket,
  skipWhitespace,
} from './code-text.js'
import { computeVarNames } from './context.js'
import { blockChain, containerArms } from './dag.js'
import { boundVarNames } from './graph/export-plan.js'
import { extractImports, importBindings } from './imports.js'
import { CORE_RUNTIME_IMPORT } from './runtime.js'

const INLINE_TAKEN = new Set(INLINE_TAKEN_NAMES)
const DECLARATION_KEYWORDS = ['const', 'let', 'var', 'function', 'class']
const OPEN = new Set(['{', '(', '['])
const CLOSE = new Set(['}', ')', ']'])

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
  const masked = maskNonCode(code)
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
 * Where a workflow's own names would clash with the names its generated code
 * binds:
 * - a loop item named like a node inside that loop whose variable holds a
 *   value (the node's `const` hides the item, and reading the item throws);
 * - an inline step that declares or imports, at its top level, a name the
 *   generated code binds around it ({@link INLINE_TAKEN_NAMES}). Inline code
 *   runs in the graph's own scope, so the declaration breaks every
 *   generated line after it. Importing a runtime name from
 *   `#awaitstep/runtime` under its own name is fine: it merges with the
 *   generated import.
 */
export function generatedNameProblems(
  ir: Pick<WorkflowIR, 'nodes' | 'edges' | 'entryNodeId'>,
): ValidationError[] {
  const problems: ValidationError[] = []
  const varNames = computeVarNames(ir.nodes)
  const bound = boundVarNames(ir, varNames)
  const arms = containerArms(ir as WorkflowIR)
  const nodes = new Map(ir.nodes.map((node) => [node.id, node]))

  for (const [nodeId, varName] of bound) {
    const node = nodes.get(nodeId)!
    for (const block of blockChain(arms, nodeId)) {
      const loop = nodes.get(block.owner)
      if (loop?.type !== 'loop' || loop.data.loopType !== 'forEach') continue
      if (String(loop.data.itemVar ?? 'item') !== varName) continue
      problems.push({
        path: `nodes.${loop.id}.data.itemVar`,
        nodeId: loop.id,
        message: `Loop "${loop.name}" item name \`${varName}\` is also step "${node.name}" inside this loop. Rename one.`,
      })
    }
  }

  for (const node of ir.nodes) {
    if (node.type !== 'step' || node.data.inline !== true) continue
    const { imports, body } = extractImports(String(node.data.code ?? ''))
    // Each name the step binds, and the module when an import binds it.
    const declared = new Map<string, string | undefined>()
    for (const name of topLevelDeclarations(body)) declared.set(name, undefined)
    for (const statement of imports) {
      for (const binding of importBindings(statement)) {
        const merges =
          binding.specifier === CORE_RUNTIME_IMPORT && binding.imported === binding.local
        if (!merges) declared.set(binding.local, binding.specifier)
      }
    }
    for (const [name, specifier] of declared) {
      if (!INLINE_TAKEN.has(name)) continue
      problems.push({
        path: `nodes.${node.id}.data.code`,
        nodeId: node.id,
        message:
          specifier === undefined
            ? `Inline step "${node.name}" declares \`${name}\`, which generated code uses. Rename it.`
            : `Inline step "${node.name}" imports \`${name}\` from "${specifier}", which generated code uses. Rename it with \`as\`.`,
      })
    }
  }
  return problems
}
