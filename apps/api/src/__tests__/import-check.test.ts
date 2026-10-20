import { describe, it, expect } from 'vitest'
import { unresolvedAppImports } from '../lib/import-check.js'

function file(path: string, source: string) {
  return { path, source }
}

describe('unresolvedAppImports', () => {
  it('passes an import that has a file behind it', () => {
    const files = [
      file('worker.ts', "import { helper } from '#app/lib/util'\n"),
      file('lib/util.ts', 'export const helper = 1\n'),
    ]
    expect(unresolvedAppImports(files)).toEqual([])
  })

  it('reports a misspelled path, with the file that imports it', () => {
    // The mistake this exists for: nothing else catches it, because each
    // file transpiles on its own with no module resolution.
    const files = [
      file('worker.ts', "import { helper } from '#app/lib/mising'\n"),
      file('lib/util.ts', 'export const helper = 1\n'),
    ]
    expect(unresolvedAppImports(files)).toEqual([
      { path: 'worker.ts', specifier: '#app/lib/mising' },
    ])
  })

  it('resolves an extensionless specifier to any code extension', () => {
    // The deploy maps `#app/*` to `./*.js` and esbuild falls back to the
    // `.ts` source, so both have to count.
    for (const ext of ['ts', 'js', 'mts', 'cts', 'mjs', 'cjs']) {
      const files = [
        file('worker.ts', "import x from '#app/lib/util'\n"),
        file(`lib/util.${ext}`, 'export default 1\n'),
      ]
      expect(unresolvedAppImports(files)).toEqual([])
    }
  })

  it('resolves a .js specifier against a .ts source', () => {
    const files = [
      file('worker.ts', "import x from '#app/lib/util.js'\n"),
      file('lib/util.ts', 'export default 1\n'),
    ]
    expect(unresolvedAppImports(files)).toEqual([])
  })

  it('resolves a json import only against the json file', () => {
    expect(
      unresolvedAppImports([
        file('worker.ts', "import data from '#app/data/x.json'\n"),
        file('data/x.json', '{}\n'),
      ]),
    ).toEqual([])
    expect(
      unresolvedAppImports([
        file('worker.ts', "import data from '#app/data/x.json'\n"),
        file('data/x.ts', 'export default {}\n'),
      ]),
    ).toHaveLength(1)
  })

  it('catches every import form', () => {
    for (const source of [
      "import x from '#app/gone'",
      "import '#app/gone'",
      "const m = await import('#app/gone')",
      "const m = require('#app/gone')",
      "export { a } from '#app/gone'",
    ]) {
      expect(unresolvedAppImports([file('worker.ts', source)])).toHaveLength(1)
    }
  })

  it('ignores a path that merely appears in a string', () => {
    // Anchored on the keyword, so prose or a log line naming a module is
    // not reported as a broken dependency.
    const files = [file('worker.ts', 'const msg = "see #app/lib/util for details"\n')]
    expect(unresolvedAppImports(files)).toEqual([])
  })

  it('ignores imports that are not #app/', () => {
    const files = [
      file('worker.ts', "import { z } from 'zod'\nimport fs from 'node:fs'\nimport './rel'\n"),
    ]
    expect(unresolvedAppImports(files)).toEqual([])
  })

  it('does not scan non-code files', () => {
    // A JSON or markdown file containing the text is data, not an import.
    const files = [file('data/x.json', '{"note":"import x from \'#app/gone\'"}')]
    expect(unresolvedAppImports(files)).toEqual([])
  })

  it('reports one finding per file and specifier, not per occurrence', () => {
    const files = [
      file('worker.ts', "import a from '#app/gone'\nimport b from '#app/gone'\n"),
      file('other.ts', "import c from '#app/gone'\n"),
    ]
    expect(unresolvedAppImports(files)).toEqual([
      { path: 'worker.ts', specifier: '#app/gone' },
      { path: 'other.ts', specifier: '#app/gone' },
    ])
  })

  it('matches case-insensitively, as the compiled path does', () => {
    const files = [
      file('worker.ts', "import x from '#app/Lib/Util'\n"),
      file('lib/util.ts', 'export default 1\n'),
    ]
    expect(unresolvedAppImports(files)).toEqual([])
  })

  it('ignores a bare #app/ with nothing after it', () => {
    expect(unresolvedAppImports([file('worker.ts', "import x from '#app/'\n")])).toEqual([])
  })
})
