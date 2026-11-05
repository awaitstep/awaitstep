import { AWAITSTEP_IMPORT_PREFIX, AWAITSTEP_MODULE_DIR, withoutComments } from '@awaitstep/codegen'
import { PROJECT_IMPORT_PREFIX, projectImportCandidates } from '@awaitstep/ir'

/**
 * Whitespace and comments between a keyword and its specifier — legal there,
 * so `from /* x *\/ '../y'` is the same import as `from '../y'`.
 */
const GAP = String.raw`(?:\s|/\*[\s\S]*?\*/|//[^\n]*\n)*`

/** One quoted specifier. A `$` is an ordinary character in a path; only a backtick's `${` makes it a pattern (TEMPLATE_IMPORT). */
const LITERAL = String.raw`(?:'([^'\n]+)'|"([^"\n]+)"|\`((?:[^\`$]|\$(?!\{))+)\`)`

/** The end of a call's first argument: `import(x)`, `import(x, { with })`. */
const ARGUMENT_END = String.raw`(?=${GAP}[,)])`

/**
 * Specifiers a file imports: `from '…'`, bare `import '…'`, dynamic
 * `import('…')` and `require('…')`, in any quote including a backtick with
 * no interpolation. Anchored on the keyword so an ordinary path written in
 * code is not mistaken for a dependency. A call counts only when the literal
 * is its whole first argument: in `import('../' + x)` the `'../'` is a piece,
 * which computedImportArguments judges.
 */
const IMPORT_SPECIFIER = new RegExp(
  String.raw`(?:\b(?:from|import)${GAP}${LITERAL}|\b(?:import|require)${GAP}\(${GAP}${LITERAL}${ARGUMENT_END})`,
  'g',
)

function specifierOf(match: RegExpMatchArray): string {
  return decodeEscapes(match.slice(1, 7).find((group) => group !== undefined)!)
}

const STRING_ESCAPE = /\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|[\s\S])/g

/**
 * A literal's text as the bundler reads it: `'\u002e\u002e/x'` is `'../x'`.
 * Judged undecoded, an escaped path slipped past every check here.
 */
function decodeEscapes(text: string): string {
  return text.replace(STRING_ESCAPE, (_, escape: string) => {
    if (escape.startsWith('u{')) return String.fromCodePoint(parseInt(escape.slice(2, -1), 16))
    if (escape.length > 1 && (escape[0] === 'u' || escape[0] === 'x')) {
      return String.fromCharCode(parseInt(escape.slice(1), 16))
    }
    return escape
  })
}

export interface UnresolvedImport {
  /** The file doing the importing. */
  path: string
  specifier: string
}

/**
 * `#app/` and `#awaitstep/` imports with no file behind them.
 *
 * Nothing else checks this. The compile step transpiles each file on its
 * own with no module resolution, so `#app/lib/mising` parses perfectly and
 * fails only at the bundler — and a misspelled path is the likeliest
 * mistake when code is written by something that cannot see the file tree.
 * `#awaitstep/*` works the same way, resolving against the bundle's
 * `awaitstep/` modules.
 *
 * Resolution mirrors the `imports` map the deploy carries, **case
 * sensitively**: the build runs on Linux, where `Lib/Util` and `lib/util`
 * are different files. (`compiledPathKey` lower-cases, which is right for
 * finding collisions and wrong for resolving a path.)
 *
 * @param files every file the deploy will see — assets included, since
 *   `#app/data/x.json` resolves to one.
 * @param codeFiles the subset worth scanning for imports.
 * @param imports the project's own `package.json` `imports` map, which the
 *   deploy carries into the worker manifest. A specifier one of its
 *   patterns claims is resolved by Node, whatever the file tree looks like,
 *   so it is not this check's business.
 */
export function unresolvedAppImports(
  files: readonly { path: string }[],
  codeFiles: readonly { path: string; source: string }[],
  imports?: Readonly<Record<string, string>>,
): UnresolvedImport[] {
  const present = new Set(files.map((file) => file.path))
  const declared = Object.keys(imports ?? {})
  const unresolved: UnresolvedImport[] = []
  const seen = new Set<string>()

  for (const file of codeFiles) {
    for (const match of withoutComments(file.source).matchAll(IMPORT_SPECIFIER)) {
      const specifier = specifierOf(match)
      const target = resolutionTarget(specifier)
      if (target === null) continue
      if (claimedByManifest(specifier, declared)) continue
      if (target === '' || resolves(target, present)) continue
      // One report per file and specifier: the same bad import written
      // twice in a file is one mistake to fix.
      const key = JSON.stringify([file.path, specifier])
      if (seen.has(key)) continue
      seen.add(key)
      unresolved.push({ path: file.path, specifier })
    }
  }
  return unresolved
}

/**
 * The bundle path a generated import points at, or null when the specifier
 * is not one of the generated prefixes.
 */
function resolutionTarget(specifier: string): string | null {
  if (specifier.startsWith(PROJECT_IMPORT_PREFIX)) {
    return specifier.slice(PROJECT_IMPORT_PREFIX.length)
  }
  if (specifier.startsWith(AWAITSTEP_IMPORT_PREFIX)) {
    return `${AWAITSTEP_MODULE_DIR}${specifier.slice(AWAITSTEP_IMPORT_PREFIX.length)}`
  }
  return null
}

/**
 * Relative or absolute imports that resolve outside the bundle root.
 *
 * Wrangler's bundler follows any path on the filesystem it runs on, so
 * `import cfg from '../../srv/app/config.json'` packs a file from the build
 * host into the user's Worker. This is the gate every bundling path passes;
 * the host-side runners add a real-resolver check on top.
 *
 * Scans the **raw** source — no comment or type-only stripping. Both
 * strippers can be steered past a real import (`'a//b'; import x from
 * '../y'` on one line; `import type from '../y'` is a value import named
 * `type`), and a refusal over a commented-out line is the safe way to be
 * wrong.
 */
export function escapingImports(
  codeFiles: readonly { path: string; source: string }[],
): UnresolvedImport[] {
  const escaping: UnresolvedImport[] = []
  const seen = new Set<string>()
  function report(path: string, specifier: string) {
    const key = JSON.stringify([path, specifier])
    if (seen.has(key)) return
    seen.add(key)
    escaping.push({ path, specifier })
  }
  for (const file of codeFiles) {
    const dir = file.path.split('/').slice(0, -1)
    for (const match of file.source.matchAll(IMPORT_SPECIFIER)) {
      const specifier = specifierOf(match)
      if (escapesRoot(dir, specifier)) report(file.path, specifier)
    }
    // A template with interpolation is a glob to the bundler: its static
    // parts are the pattern, so they are judged with each `${…}` standing in
    // for one path segment.
    for (const match of file.source.matchAll(TEMPLATE_IMPORT)) {
      const pattern = decodeEscapes(match[1]!.replace(/\$\{[^}]*\}/g, 'x'))
      if (escapesRoot(dir, pattern)) report(file.path, match[1]!)
    }
    for (const argument of computedImportArguments(file.source)) {
      if (computedArgumentEscapes(argument)) report(file.path, argument.text)
    }
  }
  return escaping
}

const TEMPLATE_IMPORT = new RegExp(
  String.raw`\b(?:import|require)${GAP}\(${GAP}\`([^\`]*\$\{[^\`]*)\`${ARGUMENT_END}`,
  'g',
)

const DYNAMIC_CALL = new RegExp(String.raw`\b(?:import|require)${GAP}\(`, 'g')

interface ComputedArgument {
  text: string
  /** The static text of every string and template literal, in order. */
  literals: string[]
  /** Whether the expression opens with a literal — its text then leads the path. */
  leadingLiteral: boolean
}

/**
 * `import(…)` / `require(…)` arguments that are anything other than one
 * literal — `'../' + 'x'`, `['..', 'x'].join('/')`. The bundler folds
 * constant concatenations and treats the rest as a glob over their static
 * parts, so a path built in pieces reaches as far as one written whole.
 */
function computedImportArguments(source: string): ComputedArgument[] {
  const found: ComputedArgument[] = []
  for (const call of source.matchAll(DYNAMIC_CALL)) {
    const start = call.index! + call[0].length
    const literals: string[] = []
    let literalCount = 0
    let depth = 1
    let i = start
    let firstToken: 'literal' | 'other' | null = null
    let otherTokens = false
    while (i < source.length && depth > 0) {
      const ch = source[i]!
      if (ch === '/' && (source[i + 1] === '*' || source[i + 1] === '/')) {
        const close = source[i + 1] === '*' ? '*/' : '\n'
        const end = source.indexOf(close, i + 2)
        i = end === -1 ? source.length : end + close.length
        continue
      }
      if (ch === "'" || ch === '"' || ch === '`') {
        const end = literalEnd(source, i)
        const body = source.slice(i + 1, end)
        literals.push(decodeEscapes(ch === '`' ? body.replace(/\$\{[^}]*\}/g, '') : body))
        literalCount++
        firstToken ??= 'literal'
        i = end + 1
        continue
      }
      if (ch === '(' || ch === '[' || ch === '{') depth++
      else if (ch === ')' || ch === ']' || ch === '}') depth--
      // The first argument is the specifier; options after it are not.
      if (depth === 1 && ch === ',') break
      if (depth > 0 && !/\s/.test(ch)) {
        firstToken ??= 'other'
        otherTokens = true
      }
      i++
    }
    // One plain literal is IMPORT_SPECIFIER's or TEMPLATE_IMPORT's to judge.
    if (literalCount === 0 || (literalCount === 1 && !otherTokens)) continue
    found.push({
      text: source.slice(start, source[i] === ',' ? i : i - 1).trim(),
      literals,
      leadingLiteral: firstToken === 'literal',
    })
  }
  return found
}

// A quote or double quote cannot span a line, so a stray one (in a comment,
// say) ends at the newline instead of swallowing the rest of the file.
function literalEnd(source: string, open: number): number {
  const quote = source[open]
  let i = open + 1
  while (i < source.length && source[i] !== quote && (quote === '`' || source[i] !== '\n')) {
    if (source[i] === '\\') i++
    i++
  }
  return i
}

/**
 * Conservative on purpose: any `..` segment in the pieces, or joined across
 * them (`'.' + './x'`), refuses — even one that would stay inside the
 * project. Telling those apart means evaluating the expression; a path built
 * in pieces that climbs at all is rare enough to write differently.
 */
function computedArgumentEscapes(argument: ComputedArgument): boolean {
  if (argument.leadingLiteral && argument.literals[0]!.startsWith('/')) return true
  const hasParentSegment = (text: string) => text.split('/').includes('..')
  return argument.literals.some(hasParentSegment) || hasParentSegment(argument.literals.join(''))
}

function escapesRoot(dir: readonly string[], specifier: string): boolean {
  if (specifier.startsWith('/')) return true
  const relative =
    specifier === '.' ||
    specifier === '..' ||
    specifier.startsWith('./') ||
    specifier.startsWith('../')
  // A bare name with a `..` segment is never a package: the module collector
  // resolves `nope/../../x.txt` against the filesystem and lands outside.
  if (!relative) return specifier.split('/').includes('..')
  const stack = [...dir]
  for (const segment of specifier.split('/')) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') {
      if (stack.length === 0) return true
      stack.pop()
    } else {
      stack.push(segment)
    }
  }
  return false
}

/**
 * Whether the project's own `imports` map claims this specifier — an exact
 * key, or a `*` pattern whose halves surround it. Node's subpath imports
 * allow one `*`, so prefix plus suffix is the whole grammar.
 */
function claimedByManifest(specifier: string, declared: readonly string[]): boolean {
  return declared.some((key) => {
    const star = key.indexOf('*')
    if (star === -1) return key === specifier
    const prefix = key.slice(0, star)
    const suffix = key.slice(star + 1)
    return (
      specifier.length > prefix.length + suffix.length &&
      specifier.startsWith(prefix) &&
      specifier.endsWith(suffix)
    )
  })
}

function resolves(target: string, present: ReadonlySet<string>): boolean {
  return projectImportCandidates(target).some((candidate) => present.has(candidate))
}
