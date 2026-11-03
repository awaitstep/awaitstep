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
})
