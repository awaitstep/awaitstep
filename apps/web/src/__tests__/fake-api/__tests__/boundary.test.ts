import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const TEST_HARNESS = join(SRC, '__tests__')

const IMPORT_PATTERN = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return listSourceFiles(path)
    return /\.tsx?$/.test(entry.name) ? [path] : []
  })
}

function isTestCode(file: string): boolean {
  return file.split(sep).includes('__tests__') || /\.test\.tsx?$/.test(file)
}

/** Relative imports in `source` (a file at `file`) that land in `src/__tests__/`. */
function harnessImports(file: string, source: string): string[] {
  return [...source.matchAll(IMPORT_PATTERN)]
    .map(([, spec]) => spec!)
    .filter((spec) => spec.startsWith('.'))
    .filter((spec) => resolve(dirname(file), spec).startsWith(TEST_HARNESS))
}

describe('fake API boundary', () => {
  it('no app code imports the fake API or its fixtures', () => {
    const offenders = listSourceFiles(SRC)
      .filter((file) => !isTestCode(file))
      .flatMap((file) =>
        harnessImports(file, readFileSync(file, 'utf8')).map(
          (spec) => `${relative(SRC, file)} → ${spec}`,
        ),
      )
    expect(offenders).toEqual([])
  })

  it('catches a page importing the fake', () => {
    expect(
      harnessImports(
        join(SRC, 'routes/example.tsx'),
        "import { AMA } from '../__tests__/fake-api'",
      ),
    ).toEqual(['../__tests__/fake-api'])
  })
})
