import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// The app runs against the real API only: test fakes and fixtures live under
// `__tests__/`, and nothing the app ships may import from there.

const IMPORT_PATTERN = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return listSourceFiles(path)
    return /\.tsx?$/.test(entry.name) ? [path] : []
  })
}

const isTestCode = (path: string) =>
  path.split('/').includes('__tests__') || /\.(test|stories)\.tsx?$/.test(path)

/** Relative imports in `source` (a file at `file`) that land in test code. */
function testImports(file: string, source: string): string[] {
  return [...source.matchAll(IMPORT_PATTERN)]
    .map(([, spec]) => spec!)
    .filter((spec) => spec.startsWith('.'))
    .filter((spec) => isTestCode(relative(SRC, resolve(dirname(file), spec))))
}

describe('no dummy data in the app', () => {
  it('has no dummy backend folder', () => {
    expect(existsSync(join(SRC, 'mocks'))).toBe(false)
  })

  it('imports no test fake or fixture from app code', () => {
    const offenders = listSourceFiles(SRC)
      .filter((file) => !isTestCode(relative(SRC, file)))
      .flatMap((file) =>
        testImports(file, readFileSync(file, 'utf8')).map(
          (spec) => `${relative(SRC, file)} → ${spec}`,
        ),
      )
    expect(offenders).toEqual([])
  })

  it('catches a page importing a test fixture', () => {
    const page = join(SRC, 'routes/example.tsx')
    expect(
      testImports(
        page,
        "import { seedDb } from '../__tests__/fixtures/seed'\nimport { x } from './y'",
      ),
    ).toEqual(['../__tests__/fixtures/seed'])
  })
})
