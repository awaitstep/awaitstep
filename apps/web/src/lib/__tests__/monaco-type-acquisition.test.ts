import { describe, expect, it } from 'vitest'
import {
  acquirablePackages,
  fetchPackageTypes,
  importSpecifiers,
  packageLibs,
  packageName,
  planAcquisition,
  specKey,
  stubDeclaration,
  typesPackageName,
} from '../monaco/type-acquisition'
import { fakeJsDelivr } from './fixtures/jsdelivr'

describe('importSpecifiers', () => {
  it('finds static, re-exported, dynamic and required specifiers once each', () => {
    const source = `
      import { z } from 'zod'
      import type { Stripe } from "stripe"
      import * as all from 'zod'
      import './side-effect'
      export { x } from '#app/config/env'
      export * from "../shared"
      const lazy = await import('date-fns/format')
      const cjs = require("lodash")
      import {
        a,
        b,
      } from '@scope/pkg/sub'
      // import 'not-really' is inside a comment and still harmless
    `
    // In order of appearance; the duplicate `zod` is dropped once.
    expect(importSpecifiers(source)).toEqual([
      'zod',
      'stripe',
      './side-effect',
      '#app/config/env',
      '../shared',
      'date-fns/format',
      'lodash',
      '@scope/pkg/sub',
      'not-really',
    ])
  })
})

describe('packageName', () => {
  it('maps specifiers to their npm package and skips non-packages', () => {
    expect(packageName('zod')).toBe('zod')
    expect(packageName('zod/v4')).toBe('zod')
    expect(packageName('@scope/pkg/sub/path')).toBe('@scope/pkg')
    expect(packageName('@scope')).toBeNull()
    for (const skipped of [
      './a',
      '../a',
      '/abs',
      '#app/x',
      'node:buffer',
      'cloudflare:workers',
      'https://x/y.js',
    ]) {
      expect(packageName(skipped), skipped).toBeNull()
    }
  })

  it('derives the @types package name', () => {
    expect(typesPackageName('lodash')).toBe('@types/lodash')
    expect(typesPackageName('@scope/pkg')).toBe('@types/scope__pkg')
    // DefinitelyTyped's names are lowercase, and a scoped name may not hold capitals.
    expect(typesPackageName('JSONStream')).toBe('@types/jsonstream')
  })
})

describe('acquirablePackages / planAcquisition', () => {
  it('lists each package once, at the declared range or latest', () => {
    const sources = [
      "import { z } from 'zod'",
      "import s from 'stripe'; import { x } from 'zod/v4'",
    ]
    expect(acquirablePackages(sources, { zod: '^4.0.0' })).toEqual([
      { name: 'stripe', range: 'latest' },
      { name: 'zod', range: '^4.0.0' },
    ])
    expect(specKey({ name: '@scope/pkg', range: '^1.0.0' })).toBe('@scope/pkg@^1.0.0')
  })

  it('plans from the code files and a valid package.json only', () => {
    const files = new Map([
      ['worker.ts', { source: "import { z } from 'zod'" }],
      ['legacy.js', { source: "const s = require('stripe')" }],
      ['README.md', { source: "import nothing from 'markdown'" }],
      ['package.json', { source: '{"dependencies":{"zod":"^4.0.0"}}' }],
    ])
    const plan = planAcquisition(files)
    expect(plan.specs).toEqual([
      { name: 'stripe', range: 'latest' },
      { name: 'zod', range: '^4.0.0' },
    ])
    expect(plan.key).toBe('stripe@latest\nzod@^4.0.0')

    // A manifest the deploy would refuse declares nothing: no npm: aliases
    // or git URLs ever reach the resolver.
    files.set('package.json', { source: '{"dependencies":{"zod":"npm:zod@3.23.8"}}' })
    expect(planAcquisition(files).specs.find((s) => s.name === 'zod')?.range).toBe('latest')
    expect(planAcquisition(new Map()).key).toBe('')
  })

  it('reads no package names out of comments, but keeps type-only imports', () => {
    // The generated awaitstep/runtime.ts says "reads the fields from
    // `inputs.error`" in a doc comment: the editor asked jsDelivr for a
    // package named `inputs.error` (404) on every Code page.
    const runtimeLike = `/**
 * A Try/Catch around the node reads the fields from \`inputs.error\`.
 * Call it as you would import 'not-a-package' in prose.
 */
// see require("also-not") for details
import type { Stripe } from 'stripe'
export class HttpError extends Error {}`
    expect(acquirablePackages([runtimeLike], {})).toEqual([{ name: 'stripe', range: 'latest' }])
    expect(planAcquisition(new Map([['awaitstep/runtime.ts', { source: runtimeLike }]])).key).toBe(
      'stripe@latest',
    )
  })
})

describe('fetchPackageTypes', () => {
  it('fetches the package.json and every declaration file of a typed package', async () => {
    const fetchFn = fakeJsDelivr({
      zod: {
        version: '4.1.0',
        files: {
          '/package.json': '{"types":"./index.d.ts"}',
          '/index.d.ts': 'export * from "./lib/core"',
          '/lib/core.d.ts': 'export const z: unknown',
          '/lib/core.js': 'js',
          '/node_modules/x/y.d.ts': 'nested dependency, never',
          '/README.md': 'docs',
        },
      },
    })
    const acquired = await fetchPackageTypes({ name: 'zod', range: '^4.0.0' }, fetchFn)
    expect(acquired).toEqual({
      name: 'zod',
      version: '4.1.0',
      files: [
        { path: '/package.json', content: '{"types":"./index.d.ts"}' },
        { path: '/index.d.ts', content: 'export * from "./lib/core"' },
        { path: '/lib/core.d.ts', content: 'export const z: unknown' },
      ],
    })
    expect(packageLibs({ name: 'zod', range: '^4.0.0' }, acquired).map((l) => l.uri)).toEqual([
      'awaitstep://workflow/node_modules/zod/package.json',
      'awaitstep://workflow/node_modules/zod/index.d.ts',
      'awaitstep://workflow/node_modules/zod/lib/core.d.ts',
    ])
  })

  it('falls back to the @types package, placed under the name it describes', async () => {
    const fetchFn = fakeJsDelivr({
      lodash: { version: '4.17.21', files: { '/package.json': '{}', '/lodash.js': 'js' } },
      '@types/lodash': {
        version: '4.17.0',
        files: {
          '/package.json': '{"types":"index.d.ts"}',
          '/index.d.ts': 'export function chunk(): void',
        },
      },
    })
    const acquired = await fetchPackageTypes({ name: 'lodash', range: 'latest' }, fetchFn)
    expect(acquired?.name).toBe('@types/lodash')
    const libs = packageLibs({ name: 'lodash', range: 'latest' }, acquired)
    expect(libs.map((l) => l.uri)).toEqual([
      'awaitstep://workflow/node_modules/lodash/package.json',
      'awaitstep://workflow/node_modules/lodash/index.d.ts',
    ])
  })

  it('stubs a package that has no types anywhere, and one that cannot be resolved', async () => {
    const fetchFn = fakeJsDelivr({
      untyped: { version: '1.0.0', files: { '/package.json': '{}', '/index.js': 'js' } },
    })
    const untyped = await fetchPackageTypes({ name: 'untyped', range: 'latest' }, fetchFn)
    expect(untyped).toEqual({ name: 'untyped', version: '1.0.0', files: [] })
    expect(packageLibs({ name: 'untyped', range: 'latest' }, untyped)).toEqual([
      {
        uri: 'awaitstep://workflow/node_modules/untyped/__awaitstep_stub__.d.ts',
        content: stubDeclaration('untyped'),
      },
    ])
    expect(await fetchPackageTypes({ name: 'nope', range: 'latest' }, fetchFn)).toBeNull()
    expect(packageLibs({ name: 'nope', range: 'latest' }, null)[0]?.content).toContain(
      "declare module 'nope/*'",
    )
  })

  it('never puts a name npm would refuse into a URL', async () => {
    const fetchFn = fakeJsDelivr({})
    for (const name of [
      '../../evil',
      'zod?x=1',
      'zod#frag',
      '@Scope/pkg',
      '@scope/Pkg',
      '@scope/../x',
      '.hidden',
      'a b',
    ]) {
      await fetchPackageTypes({ name, range: 'latest' }, fetchFn)
    }
    // Refused before any request: the test cannot pass by asking nothing of
    // a name it should have asked about — the next test proves those reach jsDelivr.
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('asks jsDelivr about every name npm serves, old capitalised ones included', async () => {
    const fetchFn = fakeJsDelivr({})
    const names = ['@types/node', 'lodash.merge', '@scope/pkg', '@types/scope__pkg', 'JSONStream']
    for (const name of names) await fetchPackageTypes({ name, range: '^1.0.0' }, fetchFn)
    const asked = fetchFn.mock.calls.map(([url]) => String(url))
    for (const name of names) {
      expect(asked).toContain(`https://data.jsdelivr.com/v1/package/resolve/npm/${name}@%5E1.0.0`)
    }
  })

  it('gives an old capitalised package the types DefinitelyTyped has for it', async () => {
    const fetchFn = fakeJsDelivr({
      JSONStream: { version: '1.3.5', files: { '/package.json': '{}', '/index.js': 'js' } },
      '@types/jsonstream': {
        version: '0.8.33',
        files: { '/package.json': '{}', '/index.d.ts': 'export declare function parse(): void' },
      },
    })
    const acquired = await fetchPackageTypes({ name: 'JSONStream', range: 'latest' }, fetchFn)
    expect(acquired?.name).toBe('@types/jsonstream')
    expect(
      packageLibs({ name: 'JSONStream', range: 'latest' }, acquired).map((l) => l.uri),
    ).toEqual([
      'awaitstep://workflow/node_modules/JSONStream/package.json',
      'awaitstep://workflow/node_modules/JSONStream/index.d.ts',
    ])
  })

  it('encodes each segment of a declaration file’s path', async () => {
    const urls: string[] = []
    const fetchFn = async (url: string) => {
      urls.push(url)
      const json = url.includes('/resolve/')
        ? { version: '1.0.0' }
        : { files: [{ name: '/types/a b#c?.d.ts' }, { name: '/types/%41.d.ts' }] }
      return { ok: true, status: 200, json: async () => json, text: async () => 'x' }
    }
    const acquired = await fetchPackageTypes({ name: '@scope/pkg', range: 'latest' }, fetchFn)
    expect(urls).toContain('https://cdn.jsdelivr.net/npm/@scope/pkg@1.0.0/types/a%20b%23c%3F.d.ts')
    expect(urls).toContain('https://cdn.jsdelivr.net/npm/@scope/pkg@1.0.0/types/%2541.d.ts')
    // The path the editor lays the file under is the package's own, unencoded.
    expect(acquired?.files.map((f) => f.path)).toEqual(['/types/a b#c?.d.ts', '/types/%41.d.ts'])
  })

  it('refuses a resolved version that is not a version', async () => {
    const urls: string[] = []
    const fetchFn = async (url: string) => {
      urls.push(url)
      if (url.includes('/resolve/')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ version: '1.0.0/../../x' }),
          text: async () => '',
        }
      }
      return { ok: false, status: 404, json: async () => ({}), text: async () => '' }
    }
    expect(await fetchPackageTypes({ name: '@scope/pkg', range: '^1' }, fetchFn)).toBeNull()
    expect(urls.every((url) => url.includes('/resolve/'))).toBe(true)
    expect(urls[0]).toContain('/resolve/npm/@scope/pkg@')
  })
})
