import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// The dummy data is reached only through the dashboard hooks, so each backend
// slice swaps one hook and no page notices (W1 criterion 6).
const MAY_IMPORT_MOCKS = [
  'mocks/',
  'data/dashboard/',
  // The boundary tests quote mock paths as test input.
  '__tests__/mock-boundary.test.ts',
  'components/__tests__/import-boundary.test.ts',
]

const IMPORT_PATTERN = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return listSourceFiles(path)
    return /\.tsx?$/.test(entry.name) ? [path] : []
  })
}

/** Imports in `source` (a file at `file`) that land inside `src/mocks/`. */
function mockImports(file: string, source: string): string[] {
  return [...source.matchAll(IMPORT_PATTERN)]
    .map(([, spec]) => spec!)
    .filter((spec) => spec.startsWith('.'))
    .filter((spec) => relative(SRC, resolve(dirname(file), spec)).startsWith('mocks'))
}

describe('mock import boundary', () => {
  const files = listSourceFiles(SRC).filter(
    (file) => !MAY_IMPORT_MOCKS.some((prefix) => relative(SRC, file).startsWith(prefix)),
  )

  it('nothing outside the dashboard hooks imports the dummy data', () => {
    const offenders = files.flatMap((file) =>
      mockImports(file, readFileSync(file, 'utf8')).map(
        (spec) => `${relative(SRC, file)} → ${spec}`,
      ),
    )
    expect(offenders).toEqual([])
  })

  it('catches a page importing a mock directly', () => {
    const page = join(SRC, 'routes/example.tsx')
    expect(
      mockImports(
        page,
        "import { mockServer } from '../mocks/dashboard/server'\nimport { x } from './y'",
      ),
    ).toEqual(['../mocks/dashboard/server'])
  })
})
