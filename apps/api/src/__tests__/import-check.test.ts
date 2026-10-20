import { describe, it, expect } from 'vitest'
import { unresolvedAppImports } from '../lib/import-check.js'

function code(path: string, source: string) {
  return { path, source }
}

/** Every file the deploy sees; code files are scanned, assets only resolved. */
function check(files: { path: string; source?: string }[]) {
  const all = files.map((f) => ({ path: f.path }))
  const codeFiles = files
    .filter((f) => f.source !== undefined)
    .map((f) => ({ path: f.path, source: f.source! }))
  return unresolvedAppImports(all, codeFiles)
}

describe('unresolvedAppImports', () => {
  it('passes an import that has a file behind it', () => {
    expect(
      check([
        code('worker.ts', "import { helper } from '#app/lib/util'"),
        code('lib/util.ts', 'export const helper = 1'),
      ]),
    ).toEqual([])
  })

  it('reports a misspelled path, with the file that imports it', () => {
    expect(
      check([
        code('worker.ts', "import { helper } from '#app/lib/mising'"),
        code('lib/util.ts', 'export const helper = 1'),
      ]),
    ).toEqual([{ path: 'worker.ts', specifier: '#app/lib/mising' }])
  })

  it('resolves an asset import, which is not a code file', () => {
    // The file set has to be every file the deploy sees. Scanning only code
    // files for *targets* reported every JSON import as missing.
    expect(
      check([code('worker.ts', "import data from '#app/data/x.json'"), { path: 'data/x.json' }]),
    ).toEqual([])
  })

  it('resolves a name containing a dot', () => {
    // `app.config` has no known extension, so `#app/*` appends `.js` and the
    // name stands whole. Treating any dot as an extension flagged this.
    expect(
      check([
        code('worker.ts', "import c from '#app/config/app.config'"),
        code('config/app.config.ts', 'export default {}'),
      ]),
    ).toEqual([])
  })

  it('does not accept .mjs for an extensionless import', () => {
    // `#app/*` resolves to `./*.js`; a bundler asked for `x.js` falls back to
    // the `.ts` source and nothing else. Accepting `.mjs` here passed an
    // import that then failed at deploy.
    expect(
      check([
        code('worker.ts', "import x from '#app/lib/util'"),
        code('lib/util.mjs', 'export default 1'),
      ]),
    ).toEqual([{ path: 'worker.ts', specifier: '#app/lib/util' }])
  })

  it('accepts .js or .ts for an extensionless import', () => {
    for (const ext of ['js', 'ts']) {
      expect(
        check([
          code('worker.ts', "import x from '#app/lib/util'"),
          code(`lib/util.${ext}`, 'export default 1'),
        ]),
      ).toEqual([])
    }
  })

  it('resolves an explicit .mjs or .cjs against its own source', () => {
    expect(
      check([
        code('worker.ts', "import x from '#app/lib/util.mjs'"),
        code('lib/util.mts', 'export default 1'),
      ]),
    ).toEqual([])
  })

  it('resolves a .js specifier against a .ts source', () => {
    expect(
      check([
        code('worker.ts', "import x from '#app/lib/util.js'"),
        code('lib/util.ts', 'export default 1'),
      ]),
    ).toEqual([])
  })

  it('resolves a json import only against the json file', () => {
    expect(
      check([
        code('worker.ts', "import d from '#app/data/x.json'"),
        code('data/x.ts', 'export {}'),
      ]),
    ).toHaveLength(1)
  })

  it('is case sensitive, because the build is', () => {
    // Linux tells `Lib/Util` and `lib/util` apart, so a check that does not
    // would pass an import the deploy fails on.
    expect(
      check([
        code('worker.ts', "import x from '#app/Lib/Util'"),
        code('lib/util.ts', 'export default 1'),
      ]),
    ).toEqual([{ path: 'worker.ts', specifier: '#app/Lib/Util' }])
  })

  it('catches every import form, including a template literal', () => {
    for (const source of [
      "import x from '#app/gone'",
      "import '#app/gone'",
      "const m = await import('#app/gone')",
      'const m = await import(`#app/gone`)',
      "const m = require('#app/gone')",
      "export { a } from '#app/gone'",
    ]) {
      expect(check([code('worker.ts', source)]), source).toHaveLength(1)
    }
  })

  it('ignores a commented-out import', () => {
    for (const source of [
      "// import x from '#app/gone'",
      "/* import x from '#app/gone' */",
      "const a = 1\n// import x from '#app/gone'\n",
    ]) {
      expect(check([code('worker.ts', source)]), source).toEqual([])
    }
  })

  it('keeps a url that contains a double slash', () => {
    // The line-comment strip must not eat `https://…` inside a real import.
    expect(
      check([code('worker.ts', "const u = 'https://example.test'\nimport x from '#app/gone'")]),
    ).toHaveLength(1)
  })

  it('ignores imports that are not #app/', () => {
    expect(
      check([
        code('worker.ts', "import { z } from 'zod'\nimport fs from 'node:fs'\nimport './rel'"),
      ]),
    ).toEqual([])
  })

  it('does not scan non-code files', () => {
    expect(check([{ path: 'data/x.json' }])).toEqual([])
  })

  it('reports one finding per file and specifier, not per occurrence', () => {
    expect(
      check([
        code('worker.ts', "import a from '#app/gone'\nimport b from '#app/gone'"),
        code('other.ts', "import c from '#app/gone'"),
      ]),
    ).toEqual([
      { path: 'worker.ts', specifier: '#app/gone' },
      { path: 'other.ts', specifier: '#app/gone' },
    ])
  })

  it('ignores a bare #app/ with nothing after it', () => {
    expect(check([code('worker.ts', "import x from '#app/'")])).toEqual([])
  })
})
