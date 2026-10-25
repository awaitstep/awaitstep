import { describe, it, expect } from 'vitest'
import { escapingImports, unresolvedAppImports } from '../lib/import-check.js'

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

describe('imports that resolve for reasons this check has to know about', () => {
  it('ignores a type-only import, which is erased before bundling', () => {
    // `types.d.ts` resolves for the type checker and for nothing else, so
    // requiring a module behind it was a permanent ok:false on a workflow
    // that deploys fine.
    const files = [{ path: 'types.d.ts' }, { path: 'lib/a.ts' }]
    const code = [
      {
        path: 'lib/a.ts',
        source: [
          "import type { Row } from '#app/types'",
          "export type { Row as R } from '#app/types'",
          'export const a = 1',
        ].join('\n'),
      },
    ]
    expect(unresolvedAppImports(files, code)).toEqual([])
  })

  it('still reports a value import, even one with an inline type specifier', () => {
    const code = [
      {
        path: 'lib/a.ts',
        source: "import { type Row, rows } from '#app/missing'\nexport default rows",
      },
    ]
    expect(unresolvedAppImports([{ path: 'lib/a.ts' }], code)).toEqual([
      { path: 'lib/a.ts', specifier: '#app/missing' },
    ])
  })

  it('accepts a declaration file for an extensionless specifier', () => {
    const files = [{ path: 'env.d.ts' }]
    const code = [{ path: 'lib/a.ts', source: "import x from '#app/env'\nexport default x" }]
    expect(unresolvedAppImports(files, code)).toEqual([])
  })

  it('leaves the project’s own imports map alone', () => {
    // The deploy carries the project package.json's `imports` into the
    // worker manifest, so Node resolves these whatever the file tree holds.
    const code = [
      {
        path: 'lib/a.ts',
        source:
          "import v from '#app/vendor/thing'\nimport e from '#app/exact'\nexport default [v, e]",
      },
    ]
    const imports = { '#app/vendor/*': './third_party/*.js', '#app/exact': './x.js' }
    expect(unresolvedAppImports([{ path: 'lib/a.ts' }], code, imports)).toEqual([])
    // Without the map they are exactly what the check is for.
    expect(unresolvedAppImports([{ path: 'lib/a.ts' }], code).map((u) => u.specifier)).toEqual([
      '#app/vendor/thing',
      '#app/exact',
    ])
  })

  it('does not let a pattern match less than one character', () => {
    const code = [{ path: 'lib/a.ts', source: "import v from '#app/vendor/'\nexport default v" }]
    const imports = { '#app/vendor/*': './third_party/*.js' }
    expect(unresolvedAppImports([{ path: 'lib/a.ts' }], code, imports)).toHaveLength(1)
  })
})

describe('escapingImports', () => {
  it('reports relative imports that climb above the project, per file', () => {
    expect(
      escapingImports([
        code('lib/a.ts', "import cfg from '../../srv/app/config.json'"),
        code('handlers/fetch.ts', "export { x } from '../lib/a'"),
        code('nodes/step_a.ts', "const m = await import('../../../etc/x.json')"),
      ]),
    ).toEqual([
      { path: 'lib/a.ts', specifier: '../../srv/app/config.json' },
      { path: 'nodes/step_a.ts', specifier: '../../../etc/x.json' },
    ])
  })

  it('reports absolute imports', () => {
    expect(escapingImports([code('a.ts', "import x from '/etc/passwd.json'")])).toEqual([
      { path: 'a.ts', specifier: '/etc/passwd.json' },
    ])
  })

  it('passes contained relative imports, bare packages and project aliases', () => {
    expect(
      escapingImports([
        code('lib/deep/a.ts', "import b from '../b'\nimport c from '../../c'"),
        code(
          'x.ts',
          "import z from 'zod'\nimport u from '#app/lib/u'\nimport n from 'node:buffer'",
        ),
        code('y.ts', "import s from './lib/../lib/./s'"),
      ]),
    ).toEqual([])
  })

  it('cannot be steered past by a comment-like string on the same line', () => {
    // A comment stripper would eat the rest of this line, import included.
    const source = "const u = 'a//b'; import cfg from '../../srv/x.json'"
    expect(escapingImports([code('a.ts', source)])).toHaveLength(1)
  })

  it('cannot be steered past by an import that only looks type-only', () => {
    // `import type from '…'` imports a default export named `type` — a value.
    expect(escapingImports([code('a.ts', "import type from '../../srv/x.json'")])).toHaveLength(1)
  })

  it('fails safe on a commented-out escaping import', () => {
    expect(escapingImports([code('a.ts', "// import x from '../../y.json'")])).toHaveLength(1)
  })
})

describe('escapingImports — specifiers the scan used to skip', () => {
  it('reads a "$" in a quoted path as the character it is', () => {
    // `$` was excluded to keep backtick templates out, which dropped every
    // quoted specifier containing one.
    expect(escapingImports([code('a.ts', "import x from '../../$secrets/key.json'")])).toEqual([
      { path: 'a.ts', specifier: '../../$secrets/key.json' },
    ])
    expect(unresolvedAppImports([], [code('a.ts', "import x from '#app/lib/$util'")])).toEqual([
      { path: 'a.ts', specifier: '#app/lib/$util' },
    ])
  })

  it('looks past a comment between the keyword and the specifier', () => {
    for (const source of [
      "import x from /* c */ '../../y.json'",
      "const m = await import(/* webpackIgnore: true */ '../../y.json')",
      "const m = require(// note\n'../../y.json')",
    ]) {
      expect(escapingImports([code('a.ts', source)]), source).toHaveLength(1)
    }
  })
})

describe('escapingImports — escaped paths', () => {
  it('decodes string escapes before judging, as the bundler does', () => {
    for (const source of [
      String.raw`import x from '\u002e\u002e/\u002e\u002e/host.json'`,
      String.raw`const m = await import('\x2e\x2e/host.json')`,
      String.raw`const m = require("\u{2e}\u{2e}/host.json")`,
      String.raw`const m = await import('\u002e./' + name)`,
      'const m = await import(`\\u002e\\u002e/${name}.json`)',
    ]) {
      expect(escapingImports([code('a.ts', source)]), source).toHaveLength(1)
    }
  })

  it('leaves an escaped character that stays inside alone', () => {
    expect(
      escapingImports([code('lib/a.ts', String.raw`import x from './d\u0061ta.json'`)]),
    ).toEqual([])
  })
})

describe('escapingImports — paths built in pieces', () => {
  it('refuses a concatenation that climbs out', () => {
    for (const source of [
      "const m = await import('../' + 'host.json')",
      "const m = require('..' + '/host.json')",
      "const m = await import('.' + './host.json')",
      "const m = await import(base + '/../host.json')",
      "const m = await import(['..', 'host.json'].join('/'))",
      'const m = await import(`..` + `/host.json`)',
    ]) {
      expect(escapingImports([code('a.ts', source)]), source).toHaveLength(1)
    }
  })

  it('refuses an absolute path built in pieces', () => {
    expect(escapingImports([code('a.ts', "await import('/etc/' + name)")])).toHaveLength(1)
  })

  it('passes pieces that never climb', () => {
    for (const source of [
      "const m = await import('./data/' + name + '.json')",
      "const m = await import(name + '.json')",
      'const m = await import(specifier)',
      "const m = await import('./plain.js')",
    ]) {
      expect(escapingImports([code('lib/a.ts', source)]), source).toEqual([])
    }
  })

  it('is not thrown off by a stray quote in a comment inside the call', () => {
    expect(
      escapingImports([
        code('a.ts', "await import(name /* don't */ + '.json')\nconst ok = '../x'"),
      ]),
    ).toEqual([])
  })
})

describe('escapingImports — what the bundler does beyond plain specifiers', () => {
  it('reports a bare name with a ".." segment, which only the module collector resolves', () => {
    expect(
      escapingImports([code('a.ts', "import t from 'nope/../../../host-secret.txt'")]),
    ).toEqual([{ path: 'a.ts', specifier: 'nope/../../../host-secret.txt' }])
  })

  it('reports a template import whose glob pattern climbs out', () => {
    expect(
      escapingImports([code('a.ts', 'export default await import(`../host-${n}.json`)')]),
    ).toEqual([{ path: 'a.ts', specifier: '../host-${n}.json' }])
  })

  it('passes a template import whose glob stays inside', () => {
    expect(
      escapingImports([code('lib/a.ts', 'const m = await import(`../data/${name}.json`)')]),
    ).toEqual([])
  })

  it('passes bare scoped packages and subpaths', () => {
    expect(
      escapingImports([code('a.ts', "import a from '@scope/pkg/sub'\nimport b from 'zod/v4'")]),
    ).toEqual([])
  })
})
