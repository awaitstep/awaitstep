import { PROJECT_IMPORT_PREFIX, fileExtension } from '@awaitstep/ir'

/**
 * Specifiers a file imports: `from '…'`, bare `import '…'`, dynamic
 * `import('…')` and `require('…')`, in any quote including a backtick with
 * no interpolation. Anchored on the keyword so an ordinary path written in
 * code is not mistaken for a dependency.
 */
const IMPORT_SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)(['"`])([^'"`$]+)\1/g

const BLOCK_COMMENT = /\/\*[\s\S]*?\*\//g
const LINE_COMMENT = /(^|[^:])\/\/[^\n]*/g

/**
 * A whole `import type … from '…'` or `export type … from '…'` statement.
 *
 * These are erased before anything bundles, so the file behind them need
 * not exist as a module — `import type { Row } from '#app/types'` is
 * satisfied by a `types.d.ts`, which resolves for the type checker and for
 * nothing else. Reporting them was a permanent `ok: false` on workflows
 * that deploy perfectly well. An inline `{ type A, b }` is **not** matched:
 * `b` is a value, so that import is real.
 */
const TYPE_ONLY_STATEMENT = /\b(?:import|export)\s+type\s+[^;'"`]*?\bfrom\s*(['"`])[^'"`]*\1/g

/**
 * How `PROJECT_IMPORTS_FIELD` maps an explicit extension to the file on
 * disk, plus the source file a bundler falls back to. `#app/*.mts` resolves
 * to `*.mjs`, which is the compiled name of an `.mts` source.
 */
const BY_EXTENSION: Readonly<Record<string, readonly string[]>> = {
  json: ['json'],
  mjs: ['mjs', 'mts'],
  cjs: ['cjs', 'cts'],
  mts: ['mjs', 'mts'],
  cts: ['cjs', 'cts'],
  js: ['js', 'ts'],
  ts: ['js', 'ts'],
}

/**
 * Everything else falls through `#app/*` → `./*.js`, so only a `.js` file
 * or the `.ts` source it compiles from will satisfy it. Notably **not**
 * `.mjs`/`.cjs`: a bundler asked for `x.js` does not try those, so counting
 * them would pass an import the deploy then fails on.
 */
const DEFAULT_EXTENSIONS = ['js', 'ts'] as const

export interface UnresolvedImport {
  /** The file doing the importing. */
  path: string
  specifier: string
}

/**
 * `#app/` imports with no file behind them.
 *
 * Nothing else checks this. The compile step transpiles each file on its
 * own with no module resolution, so `#app/lib/mising` parses perfectly and
 * fails only at the bundler — and a misspelled path is the likeliest
 * mistake when code is written by something that cannot see the file tree.
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
      const specifier = match[2]!
      if (!specifier.startsWith(PROJECT_IMPORT_PREFIX)) continue
      if (claimedByManifest(specifier, declared)) continue
      const target = specifier.slice(PROJECT_IMPORT_PREFIX.length)
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
  for (const file of codeFiles) {
    const dir = file.path.split('/').slice(0, -1)
    for (const match of file.source.matchAll(IMPORT_SPECIFIER)) {
      const specifier = match[2]!
      if (!escapesRoot(dir, specifier)) continue
      const key = JSON.stringify([file.path, specifier])
      if (seen.has(key)) continue
      seen.add(key)
      escaping.push({ path: file.path, specifier })
    }
  }
  return escaping
}

function escapesRoot(dir: readonly string[], specifier: string): boolean {
  if (specifier.startsWith('/')) return true
  const relative =
    specifier === '.' ||
    specifier === '..' ||
    specifier.startsWith('./') ||
    specifier.startsWith('../')
  if (!relative) return false
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
 * Comments stripped so a commented-out import is not reported as broken.
 *
 * Known limit: a specifier written inside a *string* that also contains the
 * word `from` or `import` still matches. Erring that way is deliberate — a
 * needless diagnostic names a line to look at, while a missed import fails
 * later at the bundler with no file attached.
 */
function withoutComments(source: string): string {
  return source
    .replace(BLOCK_COMMENT, '')
    .replace(LINE_COMMENT, '$1')
    .replace(TYPE_ONLY_STATEMENT, '')
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
  const extension = fileExtension(target)
  const mapped = BY_EXTENSION[extension]
  if (mapped) {
    const base = target.slice(0, -(extension.length + 1))
    return mapped.some((ext) => present.has(`${base}.${ext}`))
  }
  // No extension, or a dot that is part of the name (`config/app.config`):
  // the catch-all pattern appends `.js`, so the name stands whole. A
  // `.d.ts` counts: a declaration file satisfies the only kind of import
  // that can be left pointing at one, since type-only statements are
  // stripped before this runs.
  return (
    DEFAULT_EXTENSIONS.some((ext) => present.has(`${target}.${ext}`)) ||
    present.has(`${target}.d.ts`)
  )
}
