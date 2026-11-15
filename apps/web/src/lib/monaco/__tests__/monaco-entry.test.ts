import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

// `@monaco-editor/react`'s loader fetches Monaco from a CDN unless the bundled
// instance is configured before its first `init()`. Only the runtime may reach
// Monaco at runtime, so nothing can initialise it ahead of the bundle.
const SRC = join(__dirname, '..', '..', '..')
const ALLOWED = new Set(['lib/monaco/runtime.ts', 'lib/monaco/bundled-monaco.ts'])
const MONACO = /^(?:@monaco-editor\/(?:react|loader)|monaco-editor)(?:\/|$)/

/** Whether the file imports Monaco as a value: a static import that is not `import type`, or a dynamic one. */
function importsMonacoValue(source: string): boolean {
  const specifiers =
    /from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]|(?:^|\n)\s*import\s+['"]([^'"]+)['"]/g
  for (const match of source.matchAll(specifiers)) {
    const specifier = match[1] ?? match[2] ?? match[3]!
    if (!MONACO.test(specifier)) continue
    // A dynamic import or a bare side-effect import always loads it.
    if (match[1] === undefined) return true
    const at = Math.max(
      source.lastIndexOf('import', match.index),
      source.lastIndexOf('export', match.index),
    )
    if (!/^(?:import|export)\s+type\b/.test(source.slice(at, match.index))) return true
  }
  return false
}

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : sources(path)
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : []
  })
}

describe('the Monaco entry point', () => {
  it('lets only the runtime and the bundle import Monaco as a value', () => {
    const offenders = sources(SRC)
      .map((path) => relative(SRC, path))
      .filter((path) => !ALLOWED.has(path))
      .filter((path) => importsMonacoValue(readFileSync(join(SRC, path), 'utf8')))
    expect(offenders).toEqual([])
  })

  it('tells a value import from a type-only one', () => {
    expect(importsMonacoValue("import type { editor } from 'monaco-editor'")).toBe(false)
    expect(
      importsMonacoValue("import { x } from 'a'\nimport type { M } from '@monaco-editor/react'"),
    ).toBe(false)
    expect(importsMonacoValue("import { useMonaco } from '@monaco-editor/react'")).toBe(true)
    expect(importsMonacoValue("const m = lazy(() => import('@monaco-editor/react'))")).toBe(true)
    expect(importsMonacoValue("import { loader } from '@monaco-editor/loader'")).toBe(true)
    expect(importsMonacoValue("import 'monaco-editor'")).toBe(true)
    expect(importsMonacoValue("export { editor } from 'monaco-editor'")).toBe(true)
    expect(importsMonacoValue("export type { editor } from 'monaco-editor'")).toBe(false)
  })
})
