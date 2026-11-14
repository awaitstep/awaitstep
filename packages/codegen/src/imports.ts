import { GenerateInputError } from './errors.js'

/**
 * Splits `import` statements (single- or multi-line) from the rest of a code
 * block: a step's imports go to the top of its module, a trigger's to the
 * top of the generated Worker file.
 */
export function extractImports(code: string): { imports: string[]; body: string } {
  const lines = code.split('\n')
  const imports: string[] = []
  const bodyLines: string[] = []
  let pendingImport: string[] | null = null

  for (const line of lines) {
    if (pendingImport) {
      pendingImport.push(line)
      if (/from\s+['"]/.test(line)) {
        imports.push(pendingImport.join('\n').trim())
        pendingImport = null
      }
    } else if (/^\s*import\s+/.test(line)) {
      // Complete on one line: `import x from "y"` or a side-effect
      // `import "./y";`. Only a truly open statement (multi-line named
      // imports) may consume following lines.
      if (/from\s+['"]/.test(line) || /^\s*import\s+['"][^'"]*['"];?\s*$/.test(line)) {
        imports.push(line.trim())
      } else {
        pendingImport = [line]
      }
    } else {
      bodyLines.push(line)
    }
  }

  if (pendingImport) {
    bodyLines.push(...pendingImport)
  }

  return { imports, body: bodyLines.join('\n') }
}

/** One name an `import` statement binds in its module. */
export interface ImportBinding {
  local: string
  /** `default`, `*`, or the exported name. */
  imported: string
  specifier: string
  typeOnly: boolean
}

interface ParsedImport {
  specifier: string
  bindings: ImportBinding[]
}

/** Longer than this, an import is kept as written: no merging, no clash check. */
const MAX_IMPORT_LENGTH = 4096
// Anchored at the statement's end, with nothing before `from` that competes
// for the same characters: a failed match costs the statement's length.
const FROM_RE = /\bfrom\s*(['"])([^'"\n]+)\1\s*;?$/
const NAMED_RE = /^(type\s+)?([\w$]+|"[^"]*"|'[^']*')(?:\s+as\s+([\w$]+))?$/

/**
 * `statement` without its comments (a trailing `// note`, one inside a
 * multi-line brace list). Quoted text is kept as is, so a URL specifier's
 * `//` survives.
 */
function withoutComments(statement: string): string {
  let out = ''
  let quote: string | null = null
  for (let i = 0; i < statement.length; i++) {
    const char = statement[i]!
    if (quote) {
      out += char
      if (char === quote) quote = null
    } else if (char === '"' || char === "'") {
      quote = char
      out += char
    } else if (char === '/' && statement[i + 1] === '/') {
      while (i < statement.length && statement[i] !== '\n') i += 1
      out += '\n'
    } else if (char === '/' && statement[i + 1] === '*') {
      const end = statement.indexOf('*/', i + 2)
      i = end < 0 ? statement.length : end + 1
      out += ' '
    } else {
      out += char
    }
  }
  return out.trim()
}

function parseImport(statement: string): ParsedImport | null {
  if (statement.length > MAX_IMPORT_LENGTH) return null
  const text = withoutComments(statement)
  if (!/^import\s/.test(text)) return null
  const from = FROM_RE.exec(text)
  if (!from) return null
  let clause = text.slice('import'.length, from.index).trim()
  const statementTypeOnly = /^type\s/.test(clause) && !/^type\s*(?:,|from\b)/.test(clause)
  if (statementTypeOnly) clause = clause.slice('type'.length).trim()
  if (!clause) return null
  const specifier = from[2]!
  const bindings: ImportBinding[] = []
  const open = clause.indexOf('{')
  const head = (open >= 0 ? clause.slice(0, open) : clause).trim().replace(/,$/, '').trim()
  if (open >= 0) {
    const close = clause.lastIndexOf('}')
    if (close < open || clause.slice(close + 1).trim()) return null
    for (const raw of clause.slice(open + 1, close).split(',')) {
      const part = raw.trim()
      if (!part) continue
      const named = NAMED_RE.exec(part)
      if (!named) return null
      const imported = named[2]!
      const local = named[3] ?? imported
      if (!/^[\w$]+$/.test(local)) return null
      bindings.push({ local, imported, specifier, typeOnly: statementTypeOnly || !!named[1] })
    }
  }
  if (head) {
    for (const raw of head.split(',')) {
      const part = raw.trim()
      const namespace = /^\*\s+as\s+([\w$]+)$/.exec(part)
      if (namespace) {
        bindings.push({
          local: namespace[1]!,
          imported: '*',
          specifier,
          typeOnly: statementTypeOnly,
        })
      } else if (/^[\w$]+$/.test(part)) {
        bindings.push({ local: part, imported: 'default', specifier, typeOnly: statementTypeOnly })
      } else {
        return null
      }
    }
  }
  return { specifier, bindings }
}

/**
 * The names an `import` statement binds, or `[]` for a side-effect import or
 * one this reader doesn't follow.
 */
export function importBindings(statement: string): ImportBinding[] {
  return parseImport(statement)?.bindings ?? []
}

/** An `import` statement and the node whose code asked for it, if any. */
export interface ImportSource {
  statement: string
  /**
   * Who asked for it, as the error should name it (`"Fetch user"`, `The
   * trigger code`); absent for the generator's own imports.
   */
  origin?: string
}

/**
 * How an import clash names the node whose code asked for it. Only a step's
 * code hoists imports into the graph module; one found in a container's part
 * came from a step inside it.
 */
export function importOrigin(node: { type: string; name: string } | undefined): string | undefined {
  if (!node) return undefined
  return node.type === 'step' ? `"${node.name}"` : `A step in "${node.name}"`
}

function namedClause(bindings: ImportBinding[]): string {
  const allTypes = bindings.every((b) => b.typeOnly)
  const names = bindings.map((b) => {
    const name = b.imported === b.local ? b.local : `${b.imported} as ${b.local}`
    return !allTypes && b.typeOnly ? `type ${name}` : name
  })
  return `${allTypes ? 'type ' : ''}{ ${names.join(', ')} }`
}

/**
 * One import block from many sources: identical statements once, and the
 * named imports of a module that several statements import from merged into
 * one statement, so an inline step that imports what the generated file
 * already imports doesn't declare it twice. A module only one statement
 * imports keeps that statement as written. A name bound to two different
 * things (another module, or another export) is refused, naming the node.
 */
export function mergeImports(sources: readonly ImportSource[]): string[] {
  const bound = new Map<string, { binding: ImportBinding; origin?: string }>()
  const groups = new Map<string, { statements: string[]; bindings: ImportBinding[] }>()
  const order: (string | { group: string })[] = []
  const seen = new Set<string>()

  for (const { statement, origin } of sources) {
    const text = statement.trim()
    const key = text.length > MAX_IMPORT_LENGTH ? text : withoutComments(text)
    if (seen.has(key)) continue
    seen.add(key)
    const parsed = parseImport(text)
    if (!parsed) {
      order.push(text)
      continue
    }
    const kept: ImportBinding[] = []
    for (const binding of parsed.bindings) {
      const previous = bound.get(binding.local)
      if (!previous) {
        bound.set(binding.local, { binding, origin })
        kept.push(binding)
        continue
      }
      const prev = previous.binding
      if (prev.specifier === binding.specifier && prev.imported === binding.imported) {
        if (!binding.typeOnly) prev.typeOnly = false
        continue
      }
      // Two type-only imports are erased at build; the editor may flag the
      // duplicate, but nothing at runtime clashes.
      if (prev.typeOnly && binding.typeOnly) {
        kept.push(binding)
        continue
      }
      const what = (b: ImportBinding) =>
        b.specifier === prev.specifier && b.specifier === binding.specifier
          ? `"${b.specifier}" (${b.imported === 'default' ? 'its default export' : b.imported === '*' ? 'the whole module' : `\`${b.imported}\``})`
          : `"${b.specifier}"`
      const who = origin ?? 'The generated code'
      const other = previous.origin
        ? previous.origin.replace(/^(The|A) /, (word) => word.toLowerCase())
        : 'the generated code'
      throw new GenerateInputError(
        `${who} imports \`${binding.local}\` from ${what(binding)}, but ${other} already imports it from ${what(prev)}. Rename it with \`as\`.`,
      )
    }
    let group = groups.get(parsed.specifier)
    if (!group) {
      group = { statements: [], bindings: [] }
      groups.set(parsed.specifier, group)
      order.push({ group: parsed.specifier })
    }
    group.statements.push(text)
    group.bindings.push(...kept)
  }

  const out: string[] = []
  for (const entry of order) {
    if (typeof entry === 'string') {
      out.push(entry)
      continue
    }
    const specifier = entry.group
    const group = groups.get(specifier)!
    if (group.statements.length === 1) {
      out.push(group.statements[0]!)
      continue
    }
    const named: ImportBinding[] = []
    for (const binding of group.bindings) {
      if (binding.imported === 'default' || binding.imported === '*') {
        const clause = binding.imported === '*' ? `* as ${binding.local}` : binding.local
        out.push(`import ${binding.typeOnly ? 'type ' : ''}${clause} from "${specifier}";`)
      } else {
        named.push(binding)
      }
    }
    if (named.length > 0) out.push(`import ${namedClause(named)} from "${specifier}";`)
  }
  return out
}
