import { describe, expect, it } from 'vitest'
import { importSpecifiers, projectImports, resolveProjectImport, sourceKey } from '../ide/imports'

const PATHS = new Set([
  'lib/payments/charge.ts',
  'lib/payments/index.ts',
  'lib/format.js',
  'lib/util/dates.ts',
])

describe('importSpecifiers', () => {
  it('finds static, side-effect, dynamic and require imports once each', () => {
    const source = `
      import { charge } from '#app/lib/payments/charge'
      import type { Card } from "#app/lib/payments/charge"
      import '#app/lib/setup'
      export * from '#app/lib/reexport'
      const lazy = await import('#app/lib/lazy')
      const legacy = require('./legacy')
    `
    // `import type` is left out, as the deploy leaves it out.
    expect(importSpecifiers(source)).toEqual([
      '#app/lib/payments/charge',
      '#app/lib/setup',
      '#app/lib/reexport',
      '#app/lib/lazy',
      './legacy',
    ])
  })

  it('does not count an import that is commented out', () => {
    const source = `
      // import { old } from '#app/lib/old'
      /* import { older } from '#app/lib/older' */
      const text = "// not a comment"; import { live } from '#app/lib/live'
    `
    expect(importSpecifiers(source)).toEqual(['#app/lib/live'])
  })

  it('returns nothing for a file without imports', () => {
    expect(importSpecifiers('export default async function run() {}')).toEqual([])
  })
})

describe('resolveProjectImport', () => {
  it('resolves #app/ specifiers with or without an extension', () => {
    expect(resolveProjectImport('#app/lib/payments/charge', 'nodes/a.ts', PATHS)).toBe(
      'lib/payments/charge.ts',
    )
    expect(resolveProjectImport('#app/lib/payments/charge.ts', 'nodes/a.ts', PATHS)).toBe(
      'lib/payments/charge.ts',
    )
    expect(resolveProjectImport('#app/lib/format', 'nodes/a.ts', PATHS)).toBe('lib/format.js')
  })

  it('does not resolve a bare #app/ folder to its index, which the deploy does not either', () => {
    expect(resolveProjectImport('#app/lib/payments', 'nodes/a.ts', PATHS)).toBeNull()
  })

  it('resolves a relative folder to its index file, as a bundler does', () => {
    expect(resolveProjectImport('./payments', 'lib/a.ts', PATHS)).toBe('lib/payments/index.ts')
  })

  it('maps the explicit extensions the way the deploy maps them', () => {
    const paths = new Set(['lib/x.mts', 'lib/y.cts', 'lib/z.mjs', 'data/d.json'])
    expect(resolveProjectImport('#app/lib/x.mjs', 'a.ts', paths)).toBe('lib/x.mts')
    expect(resolveProjectImport('#app/lib/x.mts', 'a.ts', paths)).toBe('lib/x.mts')
    expect(resolveProjectImport('#app/lib/y.cjs', 'a.ts', paths)).toBe('lib/y.cts')
    expect(resolveProjectImport('#app/data/d.json', 'a.ts', paths)).toBe('data/d.json')
    // `x.js` is not satisfied by an .mjs file.
    expect(resolveProjectImport('#app/lib/z', 'a.ts', paths)).toBeNull()
  })

  it('folds .. out of an #app/ path and refuses one that climbs out', () => {
    expect(resolveProjectImport('#app/lib/payments/../format', 'a.ts', PATHS)).toBe('lib/format.js')
    expect(resolveProjectImport('#app/../x', 'a.ts', PATHS)).toBeNull()
  })

  it('resolves relative specifiers against the importer', () => {
    expect(resolveProjectImport('./charge', 'lib/payments/index.ts', PATHS)).toBe(
      'lib/payments/charge.ts',
    )
    expect(resolveProjectImport('../util/dates', 'lib/payments/charge.ts', PATHS)).toBe(
      'lib/util/dates.ts',
    )
  })

  it('ignores packages, missing files and paths that climb out of the project', () => {
    expect(resolveProjectImport('zod', 'nodes/a.ts', PATHS)).toBeNull()
    expect(resolveProjectImport('#app/lib/missing', 'nodes/a.ts', PATHS)).toBeNull()
    expect(resolveProjectImport('../../x', 'nodes/a.ts', PATHS)).toBeNull()
  })
})

describe('projectImports', () => {
  it('lists the project files a source imports, never itself', () => {
    const source = `
      import { a } from '#app/lib/payments/charge'
      import { b } from '#app/lib/payments/charge'
      import { c } from 'zod'
      import { d } from './index'
    `
    expect(projectImports(source, 'lib/payments/index.ts', PATHS)).toEqual([
      'lib/payments/charge.ts',
    ])
  })
})

describe('the specifier cache', () => {
  it('keys a large source by a short fingerprint, not the source', () => {
    const big = `import a from '#app/lib/a'\n${'x'.repeat(500_000)}`
    expect(sourceKey(big).length).toBeLessThan(40)
  })

  it('tells apart sources of the same length', () => {
    const a = "import a from '#app/lib/a'"
    const b = "import a from '#app/lib/b'"
    expect(sourceKey(a)).not.toBe(sourceKey(b))
    expect(importSpecifiers(a)).toEqual(['#app/lib/a'])
    expect(importSpecifiers(b)).toEqual(['#app/lib/b'])
  })
})

describe('project imports with prototype-named extensions', () => {
  it.each(['constructor', '__proto__', 'toString', 'hasOwnProperty'])(
    'does not throw on #app/x.%s and resolves nothing',
    (name) => {
      const source = `import x from '#app/x.${name}'`
      expect(projectImports(source, 'worker.ts', new Set(['worker.ts']))).toEqual([])
      expect(resolveProjectImport(`./x.${name}`, 'worker.ts', new Set(['worker.ts']))).toBeNull()
    },
  )
})
